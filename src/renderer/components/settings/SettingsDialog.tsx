/**
 * Settings Dialog Component
 * Configure Ollama endpoint and model
 */

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Settings, X, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { claudeService, DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL, type OllamaModel } from '@/services/claude/ClaudeService';
import { ipcClient } from '@/services/ipc/IPCClient';

export interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: controlledOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [ollamaUrl, setOllamaUrl] = React.useState(DEFAULT_OLLAMA_URL);
  const [defaultModel, setDefaultModel] = React.useState(DEFAULT_OLLAMA_MODEL);
  const [availableModels, setAvailableModels] = React.useState<OllamaModel[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setOpen(newOpen);
    }
  };

  // Load saved settings when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const url = claudeService.getOllamaUrl();
      const model = claudeService.getDefaultModel();
      setOllamaUrl(url);
      setDefaultModel(model);
      // Also try to load from electron store if available
      if (ipcClient.isAvailable()) {
        try {
          // @ts-expect-error - using raw invoke for custom settings keys
          const storedUrl = await ipcClient.ipc?.invoke('settings:get', 'ollama_base_url') as { value?: string } | null;
          // @ts-expect-error - using raw invoke for custom settings keys
          const storedModel = await ipcClient.ipc?.invoke('settings:get', 'ollama_default_model') as { value?: string } | null;
          if (storedUrl?.value) setOllamaUrl(storedUrl.value);
          if (storedModel?.value) setDefaultModel(storedModel.value);
        } catch {
          // Ignore - use current service values
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionStatus('idle');
    setAvailableModels([]);
    // Temporarily configure with current form values to test
    const prev = claudeService.getOllamaUrl();
    const prevModel = claudeService.getDefaultModel();
    claudeService.configure(ollamaUrl, defaultModel);
    try {
      const ok = await claudeService.testConnection();
      if (ok) {
        setConnectionStatus('success');
        const models = await claudeService.listModels();
        setAvailableModels(models);
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('error');
    } finally {
      // Restore previous config if user hasn't saved yet
      claudeService.configure(prev, prevModel);
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setSaveStatus('idle');

      // Apply to service immediately
      claudeService.configure(ollamaUrl, defaultModel);

      // Persist to electron store if available
      if (ipcClient.isAvailable()) {
        // @ts-expect-error - using raw invoke for custom settings keys
        await ipcClient.ipc?.invoke('settings:set', 'ollama_base_url', ollamaUrl);
        // @ts-expect-error - using raw invoke for custom settings keys
        await ipcClient.ipc?.invoke('settings:set', 'ollama_default_model', defaultModel);
      }

      setSaveStatus('success');
      setTimeout(() => handleOpenChange(false), 800);
    } catch (error) {
      console.error('Failed to save Ollama settings:', error);
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-6 border border-gray-200 bg-white p-6 shadow-xl duration-200',
            'rounded-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-2xl font-semibold text-gray-900">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="space-y-5">
            {/* Ollama section */}
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-700">Ollama Configuration</h3>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  No API key required
                </span>
              </div>
              <p className="mb-4 text-xs text-gray-500">
                Perpetua uses your local{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">
                  Ollama
                </a>{' '}
                instance. Install Ollama and pull a model (e.g.{' '}
                <code className="rounded bg-gray-100 px-1 text-xs">ollama pull llama3.2</code>).
              </p>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      label="Ollama Base URL"
                      value={ollamaUrl}
                      onChange={(e) => {
                        setOllamaUrl(e.target.value);
                        setConnectionStatus('idle');
                      }}
                      placeholder="/ollama-api"
                      disabled={isLoading || isTesting}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      onClick={handleTestConnection}
                      disabled={isTesting || !ollamaUrl}
                      className="shrink-0"
                    >
                      {isTesting ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </Button>
                  </div>
                </div>

                {/* Connection status */}
                {connectionStatus === 'success' && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    Connected! {availableModels.length} model(s) available.
                  </div>
                )}
                {connectionStatus === 'error' && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    <XCircle className="h-4 w-4 shrink-0" />
                    Cannot connect. Is Ollama running at that URL?
                  </div>
                )}

                {/* Model selector */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Default Model
                  </label>
                  {availableModels.length > 0 ? (
                    <select
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {availableModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      placeholder="llama3.2"
                      helperText='Type a model name or click "Test" to load available models'
                      disabled={isLoading}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Save status */}
            {saveStatus === 'success' && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Settings saved!
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                Failed to save settings. Please try again.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="ghost" disabled={isLoading}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={isLoading || !ollamaUrl || !defaultModel}>
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

