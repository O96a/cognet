/**
 * Ollama AI Service
 * Connects to a local or remote Ollama instance.
 * No Anthropic/cloud API key required.
 */

export type ClaudeModel = string;

export interface ClaudeExecuteOptions {
  prompt: string;
  model?: ClaudeModel;
  maxTokens?: number;
  /** Extended thinking is silently ignored for Ollama (no-op). */
  extendedThinking?: boolean;
  thinkingBudget?: number;
  stream?: boolean;
  onChunk?: (chunk: StreamChunk) => void;
  onThinking?: (thinking: string) => void;
  systemPrompt?: string;
}

export interface StreamChunk {
  type: 'content' | 'thinking' | 'tool_use';
  content: string;
  isComplete: boolean;
}

export interface ClaudeResponse {
  content: string;
  thinking?: string;
  artifacts?: Artifact[];
  toolUses?: ToolUse[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
}

export interface Artifact {
  id: string;
  stageId?: string;
  type: 'code' | 'document' | 'visualization' | 'data';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface ToolUse {
  type: string;
  input: Record<string, unknown>;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

// Use relative proxy path to avoid CORS when served from a remote domain.
// Vite proxies /ollama-api/* → http://127.0.0.1:11434/*
export const DEFAULT_OLLAMA_URL = '/ollama-api';
export const DEFAULT_OLLAMA_MODEL = 'qwen3.5:cloud';

export class ClaudeService {
  private isInitialized = false;
  private ollamaBaseUrl = DEFAULT_OLLAMA_URL;
  private defaultModel = DEFAULT_OLLAMA_MODEL;

  /**
   * Initialize the service (Ollama mode, no API key needed).
   * Pass 'not_needed_for_ollama' or any string for backward compat.
   */
  initialize(_apiKeyUnused?: string): void {
    this.isInitialized = true;
    console.log(`✅ Ollama Service initialized (${this.ollamaBaseUrl})`);
  }

  /**
   * Configure Ollama endpoint and default model.
   */
  configure(ollamaUrl: string, defaultModel: string): void {
    this.ollamaBaseUrl = ollamaUrl || DEFAULT_OLLAMA_URL;
    this.defaultModel = defaultModel || DEFAULT_OLLAMA_MODEL;
    this.isInitialized = true;
    console.log(`✅ Ollama configured: ${this.ollamaBaseUrl} | model: ${this.defaultModel}`);
  }

  getOllamaUrl(): string {
    return this.ollamaBaseUrl;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  /** Check if service is ready. */
  getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  /** Execute a prompt against the configured Ollama instance. */
  async execute(options: ClaudeExecuteOptions): Promise<ClaudeResponse> {
    if (!this.isInitialized) {
      // Auto-initialize with defaults so the app never hard-fails
      this.initialize();
    }
    return this.executeOllama(options);
  }

  /** Fetch with retry for transient 5xx errors. */
  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (res.status >= 500 && attempt < maxRetries) {
          const body = await res.text().catch(() => '');
          console.warn(`⚠️ ${res.status} from ${url} (attempt ${attempt}/${maxRetries}): ${body.substring(0, 100)}`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          console.warn(`⚠️ Network error (attempt ${attempt}/${maxRetries}): ${lastErr.message}`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
      }
    }
    throw lastErr || new Error('Request failed after retries');
  }

  private async executeOllama(options: ClaudeExecuteOptions): Promise<ClaudeResponse> {
    const {
      prompt,
      stream = false,
      systemPrompt,
      onChunk,
    } = options;

    // Always use the configured Ollama model — ignore Claude model names
    const model = this.defaultModel;

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    if (stream) {
      return this.executeOllamaStreaming(model, messages, onChunk);
    }

    const response = await this.fetchWithRetry(`${this.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${body ? ` - ${body.substring(0, 200)}` : ''}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const message = data['message'] as Record<string, unknown> | undefined;
    const content = (message?.['content'] as string) ?? '';

    return {
      content,
      artifacts: this.extractArtifacts(content),
      usage: {
        inputTokens: (data['prompt_eval_count'] as number) || 0,
        outputTokens: (data['eval_count'] as number) || 0,
      },
    };
  }

  private async executeOllamaStreaming(
    model: string,
    messages: Array<{ role: string; content: string }>,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<ClaudeResponse> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const msg = `Ollama streaming error: ${response.status} ${response.statusText}${body ? ` - ${body.substring(0, 200)}` : ''}`;
          if (response.status >= 500 && attempt < MAX_RETRIES) {
            console.warn(`⚠️ ${msg} (attempt ${attempt}/${MAX_RETRIES}, retrying...)`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw new Error(msg);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Failed to get stream reader');

        let fullContent = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line) as Record<string, unknown>;
              // Check for error in stream
              if (json['error']) {
                throw new Error(`Ollama stream error: ${json['error']}`);
              }
              const msg = json['message'] as Record<string, unknown> | undefined;
              if (msg?.['content']) {
                const text = msg['content'] as string;
                fullContent += text;
                onChunk?.({ type: 'content', content: text, isComplete: false });
              }
              if (json['done']) {
                onChunk?.({ type: 'content', content: '', isComplete: true });
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message.startsWith('Ollama stream error:')) {
                throw parseErr;
              }
              // Ignore malformed chunks
            }
          }
        }

        return {
          content: fullContent,
          artifacts: this.extractArtifacts(fullContent),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Retry on network errors or stream errors (not on 4xx)
        if (attempt < MAX_RETRIES && !lastError.message.includes('4')) {
          console.warn(`⚠️ Attempt ${attempt} failed: ${lastError.message}. Retrying in ${attempt}s...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Ollama streaming failed after retries');
  }

  /** Fetch models currently available on the Ollama instance. */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const res = await fetch(`${this.ollamaBaseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as { models?: OllamaModel[] };
      return data.models ?? [];
    } catch {
      return [];
    }
  }

  /** Returns true when Ollama is reachable. */
  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ollamaBaseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  getAvailableModels(): ClaudeModel[] {
    return [this.defaultModel];
  }

  private extractArtifacts(content: string): Artifact[] {
    const artifacts: Artifact[] = [];
    let index = 0;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2].trim();
      if (code.length > 10) {
        artifacts.push({
          id: `artifact-${Date.now()}-${index}`,
          type: this.getArtifactType(language),
          title: `${this.capitalizeFirst(language)} Code`,
          content: code,
          metadata: { language, lineCount: code.split('\n').length },
          createdAt: Date.now(),
        });
        index++;
      }
    }
    return artifacts;
  }

  private getArtifactType(language: string): Artifact['type'] {
    const codeLanguages = ['javascript', 'typescript', 'python', 'java', 'rust', 'go', 'cpp', 'c', 'html', 'css', 'jsx', 'tsx'];
    const vizLanguages = ['mermaid', 'graphviz', 'dot', 'plantuml'];
    const dataLanguages = ['json', 'yaml', 'toml', 'xml', 'csv'];
    const lang = language.toLowerCase();
    if (codeLanguages.includes(lang)) return 'code';
    if (vizLanguages.includes(lang)) return 'visualization';
    if (dataLanguages.includes(lang)) return 'data';
    return 'document';
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export const claudeService = new ClaudeService();
