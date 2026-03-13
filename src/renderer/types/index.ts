/**
 * Core type definitions for Cognet
 * Based on ARCHITECTURE.md specifications
 */

export type StageType =
  | 'discovering'
  | 'chasing'
  | 'solving'
  | 'challenging'
  | 'questioning'
  | 'searching'
  | 'imagining'
  | 'building';

export type JourneyStatus = 'running' | 'paused' | 'stopped' | 'complete' | 'error';

export type StageStatus = 'pending' | 'running' | 'complete' | 'error';

export interface Journey {
  id: string;
  input: string;
  status: JourneyStatus;
  stages: Stage[];
  settings: JourneySettings;
  createdAt: number;
  updatedAt: number;
}

export interface Stage {
  id: string;
  journeyId: string;
  type: StageType;
  status: StageStatus;
  prompt: string;
  result: string;
  thinking?: string;
  artifacts: Artifact[];
  createdAt: number;
  qualityScore?: number;
  qualityReport?: {
    overallScore: number;
    scores: {
      completeness: number;
      depth: number;
      specificity: number;
      actionability: number;
      coherence: number;
      novelty: number;
      [key: string]: number;
    };
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
    shouldRevise: boolean;
    evaluatedAt: number;
  };
}

export interface Artifact {
  id: string;
  stageId: string;
  type: ArtifactType;
  title: string;
  content: string;
  metadata: ArtifactMetadata;
  createdAt: number;
}

export type ArtifactType = 'document' | 'code' | 'visualization' | 'mindmap' | 'other';

export interface Page {
  id: string;
  journeyId: string;
  type: PageType;
  templateName?: string;
  title: string;
  content: string;
  metadata?: PageMetadata;
  createdAt: number;
  filePath?: string;
  fileSize?: number;
  analysisData?: string;
  analysisTimestamp?: number;
  version?: number;
}

export type PageType = 'architect' | 'multi-agent' | 'template';

export interface PageMetadata {
  templateType?: 'report' | 'wiki' | 'presentation' | 'timeline' | 'mindmap' | 'literature' | 'linkedin-content' | 'website' | 'carousel';
  agents?: string[];
  generationTime?: number;
  [key: string]: unknown;
}

export interface ArtifactMetadata {
  language?: string;
  framework?: string;
  size?: number;
  [key: string]: unknown;
}

export interface JourneySettings {
  autoContinue: boolean;
  maxStages: number;
  stageDelay: number; // ms between stages
  extendedThinking: boolean;
  computerUse: boolean;
}

export const DEFAULT_SETTINGS: JourneySettings = {
  autoContinue: true,
  maxStages: 50,
  stageDelay: 2000,
  extendedThinking: true,
  computerUse: true,
};

// Claude SDK related types
export interface ClaudeResponse {
  content: string;
  thinking?: string;
  artifacts?: Artifact[];
  toolUses?: ToolUse[];
}

export interface ToolUse {
  type: string;
  input: Record<string, unknown>;
  output?: unknown;
}

export interface ClaudeExecuteOptions {
  prompt: string;
  extendedThinking?: boolean;
  tools?: string[];
  stream?: boolean;
}

// IPC Communication types
export interface IPCChannels {
  // Journey operations
  'journey:create': (input: string) => Promise<Journey>;
  'journey:get': (id: string) => Promise<Journey | null>;
  'journey:list': () => Promise<Journey[]>;
  'journey:update': (journey: Journey) => Promise<Journey>;
  'journey:delete': (id: string) => Promise<{ success: boolean }>;
  'journey:pause': (id: string) => Promise<void>;
  'journey:resume': (id: string) => Promise<void>;
  'journey:stop': (id: string) => Promise<void>;

  // Stage operations
  'stage:create': (stage: Stage) => Promise<void>;
  'stage:get': (id: string) => Promise<Stage | null>;
  'stage:list': (journeyId: string) => Promise<Stage[]>;

  // Page operations
  'page:create': (page: Page) => Promise<void>;
  'page:get': (id: string) => Promise<Page | null>;
  'page:list': (journeyId: string) => Promise<Page[]>;
  'page:delete': (id: string) => Promise<void>;
  'page:save-file': (journeyId: string, pageId: string, content: string, templateType: string) => Promise<{ filePath: string; fileSize: number }>;
  'page:read-file': (journeyId: string, pageId: string) => Promise<{ content: string }>;
  'page:save-analysis': (journeyId: string, analysis: unknown) => Promise<{ success: boolean }>;
  'page:read-analysis': (journeyId: string) => Promise<{ analysis: unknown } | null>;

  // Settings
  'settings:get': () => Promise<JourneySettings>;
  'settings:update': (settings: Partial<JourneySettings>) => Promise<JourneySettings>;

  // API Key management
  'apikey:get': (service: string) => Promise<string>;
  'apikey:set': (service: string, key: string) => Promise<void>;

  // File operations
  'file:save': (path: string, content: string) => Promise<void>;
  'file:open': (path: string) => Promise<string>;

  // Page storage/export
  'page:storage-stats': () => Promise<{ totalPages: number; totalSize: number }>;
  'page:export-pdf': (journeyId: string, pageId: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
  'page:export-html': (journeyId: string, pageId: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
}

// Store types
export interface AppState {
  // Current journey
  currentJourney: Journey | null;
  journeys: Journey[];

  // Active stage (currently executing with real-time updates)
  activeStage: Stage | null;

  // UI state
  sidebarOpen: boolean;
  selectedArtifact: Artifact | null;

  // Settings
  settings: JourneySettings;

  // Actions
  setCurrentJourney: (journey: Journey | null) => void;
  addJourney: (journey: Journey) => void;
  updateJourney: (id: string, updates: Partial<Journey>) => void;
  removeJourney: (id: string) => void;
  setActiveStage: (stage: Stage | null) => void;
  updateActiveStage: (updates: Partial<Stage>) => void;
  setSidebarOpen: (open: boolean) => void;
  setSelectedArtifact: (artifact: Artifact | null) => void;
  updateSettings: (settings: Partial<JourneySettings>) => void;
}

// Component prop types
export interface StageCardProps {
  stage: Stage;
  isActive?: boolean;
  onArtifactClick?: (artifact: Artifact) => void;
}

export interface ControlPanelProps {
  journey: Journey | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNewJourney: () => void;
}

export interface ArtifactCardProps {
  artifact: Artifact;
  onClick?: () => void;
}

export interface StreamViewProps {
  journey: Journey | null;
}
