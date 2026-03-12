/**
 * IPC Client for Electron Main Process Communication
 * Type-safe wrapper around Electron IPC
 * Falls back to an in-memory store when running outside Electron (browser mode).
 */

import type { Journey, Stage, JourneySettings, Page, IPCChannels } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import type { JourneyAnalysis } from '@/services/claude/ClaudePageAnalyzer';

/* ------------------------------------------------------------------ */
/*  In-memory store – used when Electron IPC is unavailable            */
/* ------------------------------------------------------------------ */

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class BrowserStore {
  private journeys = new Map<string, Journey>();
  private stages = new Map<string, Stage>();
  private pages = new Map<string, Page>();
  private settings: JourneySettings = { ...DEFAULT_SETTINGS };
  private apiKeys = new Map<string, string>();

  /* Journey */
  createJourney(input: string, _settings?: Partial<JourneySettings>): Journey {
    const id = genId();
    const now = Date.now();
    const journey: Journey = {
      id,
      input,
      status: 'running',
      stages: [],
      settings: { ...this.settings, ..._settings },
      createdAt: now,
      updatedAt: now,
    };
    this.journeys.set(id, journey);
    return journey;
  }

  getJourney(id: string): Journey | null {
    const j = this.journeys.get(id) ?? null;
    if (j) j.stages = this.listStages(j.id);
    return j;
  }

  listJourneys(): Journey[] {
    return [...this.journeys.values()].map((j) => ({
      ...j,
      stages: this.listStages(j.id),
    }));
  }

  updateJourney(journey: Journey): Journey {
    const existing = this.journeys.get(journey.id);
    if (!existing) throw new Error(`Journey not found: ${journey.id}`);
    const updated = { ...existing, ...journey, updatedAt: Date.now() };
    this.journeys.set(journey.id, updated);
    return updated;
  }

  deleteJourney(id: string): { success: boolean } {
    this.journeys.delete(id);
    for (const [sid, s] of this.stages) {
      if (s.journeyId === id) this.stages.delete(sid);
    }
    return { success: true };
  }

  pauseJourney(id: string): void {
    const j = this.journeys.get(id);
    if (j) { j.status = 'paused'; j.updatedAt = Date.now(); }
  }

  resumeJourney(id: string): void {
    const j = this.journeys.get(id);
    if (j) { j.status = 'running'; j.updatedAt = Date.now(); }
  }

  stopJourney(id: string): void {
    const j = this.journeys.get(id);
    if (j) { j.status = 'stopped'; j.updatedAt = Date.now(); }
  }

  /* Stage */
  createStage(stage: Stage): void {
    this.stages.set(stage.id, stage);
  }

  getStage(id: string): Stage | null {
    return this.stages.get(id) ?? null;
  }

  listStages(journeyId: string): Stage[] {
    return [...this.stages.values()].filter((s) => s.journeyId === journeyId);
  }

  /* Page */
  createPage(page: Page): void {
    this.pages.set(page.id, page);
  }

  getPage(id: string): Page | null {
    return this.pages.get(id) ?? null;
  }

  listPages(journeyId: string): Page[] {
    return [...this.pages.values()].filter((p) => p.journeyId === journeyId);
  }

  deletePage(id: string): void {
    this.pages.delete(id);
  }

  /* Settings */
  getSettings(): JourneySettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<JourneySettings>): JourneySettings {
    this.settings = { ...this.settings, ...partial };
    return { ...this.settings };
  }

  /* API Keys */
  getApiKey(service: string): string {
    return this.apiKeys.get(service) ?? '';
  }

  setApiKey(service: string, key: string): void {
    this.apiKeys.set(service, key);
  }
}

/**
 * Type-safe IPC client
 * Communicates with Electron main process
 */
export class IPCClient {
  private readonly ipc: ElectronAPI | null = null;
  private readonly store: BrowserStore;

  constructor() {
    this.store = new BrowserStore();
    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && 'electron' in window) {
      this.ipc = (window as WindowWithElectron).electron;
    }
  }

  /**
   * Check if IPC is available (running inside Electron)
   */
  isAvailable(): boolean {
    return this.ipc !== null;
  }

  /**
   * Invoke IPC method with type safety.
   * Falls back to in-memory BrowserStore when Electron is unavailable.
   */
  private async invoke<K extends keyof IPCChannels>(
    channel: K,
    ...args: Parameters<IPCChannels[K]>
  ): Promise<ReturnType<IPCChannels[K]>> {
    if (this.ipc) {
      try {
        // @ts-expect-error - Dynamic channel invocation
        return await this.ipc.invoke(channel, ...args);
      } catch (error) {
        console.error(`IPC error on channel ${String(channel)}:`, error);
        throw error;
      }
    }

    // Browser-mode fallback
    return this.handleLocally(String(channel), args) as ReturnType<IPCChannels[K]>;
  }

  /** Route IPC channels to the in-memory BrowserStore. */
  private handleLocally(channel: string, args: unknown[]): unknown {
    switch (channel) {
      case 'journey:create':   return this.store.createJourney(args[0] as string, args[1] as Partial<JourneySettings> | undefined);
      case 'journey:get':      return this.store.getJourney(args[0] as string);
      case 'journey:list':     return this.store.listJourneys();
      case 'journey:update':   return this.store.updateJourney(args[0] as Journey);
      case 'journey:delete':   return this.store.deleteJourney(args[0] as string);
      case 'journey:pause':    return this.store.pauseJourney(args[0] as string);
      case 'journey:resume':   return this.store.resumeJourney(args[0] as string);
      case 'journey:stop':     return this.store.stopJourney(args[0] as string);
      case 'stage:create':     return this.store.createStage(args[0] as Stage);
      case 'stage:get':        return this.store.getStage(args[0] as string);
      case 'stage:list':       return this.store.listStages(args[0] as string);
      case 'page:create':      return this.store.createPage(args[0] as Page);
      case 'page:get':         return this.store.getPage(args[0] as string);
      case 'page:list':        return this.store.listPages(args[0] as string);
      case 'page:delete':      return this.store.deletePage(args[0] as string);
      case 'settings:get':     return this.store.getSettings();
      case 'settings:update':  return this.store.updateSettings(args[0] as Partial<JourneySettings>);
      case 'apikey:get':       return this.store.getApiKey(args[0] as string);
      case 'apikey:set':       return this.store.setApiKey(args[0] as string, args[1] as string);
      case 'page:save-file':   return { filePath: `memory://${args[1]}`, fileSize: (args[2] as string)?.length ?? 0 };
      case 'page:read-file':   return { content: '' };
      case 'page:save-analysis': return { success: true };
      case 'page:read-analysis': return { analysis: null };
      case 'page:storage-stats': return { totalFiles: 0, totalSize: 0 };
      case 'page:export-pdf':  return { success: false, canceled: true };
      case 'page:export-html': return { success: false, canceled: true };
      case 'file:save':        return undefined;
      case 'file:open':        return '';
      default:
        console.warn(`Browser fallback: unhandled channel "${channel}"`);
        return undefined;
    }
  }

  // Journey operations
  async createJourney(input: string): Promise<Journey> {
    return this.invoke('journey:create', input);
  }

  async getJourney(id: string): Promise<Journey | null> {
    return this.invoke('journey:get', id);
  }

  async listJourneys(): Promise<Journey[]> {
    return this.invoke('journey:list');
  }

  async updateJourney(journey: Journey): Promise<Journey> {
    return this.invoke('journey:update', journey);
  }

  async pauseJourney(id: string): Promise<void> {
    return this.invoke('journey:pause', id);
  }

  async resumeJourney(id: string): Promise<void> {
    return this.invoke('journey:resume', id);
  }

  async stopJourney(id: string): Promise<void> {
    return this.invoke('journey:stop', id);
  }

  async deleteJourney(id: string): Promise<{ success: boolean }> {
    return this.invoke('journey:delete', id);
  }

  // Stage operations
  async createStage(stage: Stage): Promise<void> {
    return this.invoke('stage:create', stage);
  }

  async getStage(id: string): Promise<Stage | null> {
    return this.invoke('stage:get', id);
  }

  async listStages(journeyId: string): Promise<Stage[]> {
    return this.invoke('stage:list', journeyId);
  }

  // Settings operations
  async getSettings(): Promise<JourneySettings> {
    return this.invoke('settings:get');
  }

  async updateSettings(settings: Partial<JourneySettings>): Promise<JourneySettings> {
    return this.invoke('settings:update', settings);
  }

  // Page operations
  async createPage(page: Page): Promise<void> {
    return this.invoke('page:create', page);
  }

  async getPage(id: string): Promise<Page | null> {
    return this.invoke('page:get', id);
  }

  async listPages(journeyId: string): Promise<Page[]> {
    return this.invoke('page:list', journeyId);
  }

  async deletePage(id: string): Promise<void> {
    return this.invoke('page:delete', id);
  }

  // Page file operations (Phase 2A)
  async savePageFile(
    journeyId: string,
    pageId: string,
    content: string,
    templateName: string
  ): Promise<{ filePath: string; fileSize: number }> {
    const result = await this.invoke('page:save-file', journeyId, pageId, content, templateName);
    return result as { filePath: string; fileSize: number };
  }

  async readPageFile(filePath: string): Promise<{ content: string }> {
    // Uses raw invoke since filePath is a single arg, not (journeyId, pageId)
    if (this.ipc) {
      return this.ipc.invoke('page:read-file', filePath) as Promise<{ content: string }>;
    }
    return { content: '' };
  }

  async savePageAnalysis(journeyId: string, analysis: unknown): Promise<{ success: boolean }> {
    if (this.ipc) {
      return this.ipc.invoke('page:save-analysis', journeyId, analysis) as Promise<{ success: boolean }>;
    }
    return { success: true };
  }

  async readPageAnalysis(journeyId: string): Promise<{ analysis: JourneyAnalysis } | null> {
    if (this.ipc) {
      return this.ipc.invoke('page:read-analysis', journeyId) as Promise<{ analysis: JourneyAnalysis } | null>;
    }
    return null;
  }

  async getPageStorageStats(): Promise<unknown> {
    if (this.ipc) {
      return this.ipc.invoke('page:storage-stats');
    }
    return { totalPages: 0, totalSize: 0 };
  }

  async exportPageToPDF(
    htmlContent: string,
    defaultFilename: string
  ): Promise<{ success: boolean; filePath?: string; canceled?: boolean }> {
    if (this.ipc) {
      return this.ipc.invoke('page:export-pdf', htmlContent, defaultFilename) as Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
    }
    return { success: false };
  }

  async exportPageToHTML(
    htmlContent: string,
    defaultFilename: string
  ): Promise<{ success: boolean; filePath?: string; canceled?: boolean }> {
    if (this.ipc) {
      return this.ipc.invoke('page:export-html', htmlContent, defaultFilename) as Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
    }
    return { success: false };
  }

  // API Key operations
  async getApiKey(service: string): Promise<string> {
    return this.invoke('apikey:get', service);
  }

  async setApiKey(service: string, key: string): Promise<void> {
    return this.invoke('apikey:set', service, key);
  }

  // File operations
  async saveFile(path: string, content: string): Promise<void> {
    return this.invoke('file:save', path, content);
  }

  async openFile(path: string): Promise<string> {
    return this.invoke('file:open', path);
  }

  /**
   * Listen to IPC events
   */
  on<K extends string>(
    channel: K,
    callback: (...args: unknown[]) => void
  ): (() => void) | undefined {
    if (!this.ipc) {
      console.warn('IPC not available for event listeners');
      return;
    }

    return this.ipc.on?.(channel, callback);
  }

  /**
   * Remove IPC event listener
   */
  off<K extends string>(channel: K, callback: (...args: unknown[]) => void): void {
    if (!this.ipc) {
      return;
    }

    this.ipc.off?.(channel, callback);
  }
}

// Global types for Electron API
interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on?: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  off?: (channel: string, callback: (...args: unknown[]) => void) => void;
}

interface WindowWithElectron extends Window {
  electron: ElectronAPI;
}

// Export singleton instance
export const ipcClient = new IPCClient();
