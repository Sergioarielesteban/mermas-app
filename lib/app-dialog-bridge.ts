/**
 * Puente para diálogos in-app (sin alert/prompt/confirm del navegador).
 * `AppDialogProvider` registra la implementación al montarse.
 */

export type AppDialogBridge = {
  confirm: (message: string) => Promise<boolean>;
  alert: (message: string) => Promise<void>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
};

let bridge: AppDialogBridge | null = null;

export function setAppDialogBridge(next: AppDialogBridge | null) {
  bridge = next;
}

export function appConfirm(message: string): Promise<boolean> {
  if (bridge) return bridge.confirm(message);
  if (typeof window !== 'undefined') return Promise.resolve(window.confirm(message));
  return Promise.resolve(false);
}

export function appAlert(message: string): Promise<void> {
  if (bridge) return bridge.alert(message);
  if (typeof window !== 'undefined') window.alert(message);
  return Promise.resolve();
}

export function appPrompt(message: string, defaultValue = ''): Promise<string | null> {
  if (bridge) return bridge.prompt(message, defaultValue);
  if (typeof window !== 'undefined') return Promise.resolve(window.prompt(message, defaultValue));
  return Promise.resolve(null);
}
