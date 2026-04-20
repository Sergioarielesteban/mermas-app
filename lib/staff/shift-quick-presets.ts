/** Presets reutilizables: cuadrante operativo + modal nuevo turno. */

export type QuickShiftPreset = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  breakMinutes: number;
};

export const QUICK_SHIFT_PRESETS: readonly QuickShiftPreset[] = [
  { id: 'manana', label: 'Mañana', startTime: '08:00', endTime: '16:00', endsNextDay: false, breakMinutes: 30 },
  { id: 'tarde', label: 'Tarde', startTime: '17:00', endTime: '01:00', endsNextDay: true, breakMinutes: 30 },
  { id: 'partido', label: 'Partido', startTime: '11:00', endTime: '23:00', endsNextDay: false, breakMinutes: 60 },
  { id: 'cierre', label: 'Cierre', startTime: '18:00', endTime: '02:00', endsNextDay: true, breakMinutes: 30 },
] as const;

export function presetById(id: string): QuickShiftPreset | undefined {
  return QUICK_SHIFT_PRESETS.find((p) => p.id === id);
}

/** Valor por defecto al primer uso (sin localStorage). */
export function defaultPresetIdForZone(zoneRowKey: string): string {
  const z = zoneRowKey.trim().toLowerCase();
  if (z === 'barra') return 'tarde';
  if (z === 'cocina' || z === 'sala') return 'manana';
  return 'manana';
}

const lsKey = (localId: string, zoneRowKey: string) => `chef-op-preset:${localId}:${zoneRowKey}`;

export function readStoredPresetIdForZone(localId: string, zoneRowKey: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(lsKey(localId, zoneRowKey));
    return v && presetById(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredPresetIdForZone(localId: string, zoneRowKey: string, presetId: string): void {
  try {
    if (typeof window === 'undefined' || !presetById(presetId)) return;
    window.localStorage.setItem(lsKey(localId, zoneRowKey), presetId);
  } catch {
    /* ignore */
  }
}

export function resolveQuickPresetForZone(localId: string, zoneRowKey: string): QuickShiftPreset {
  const stored = readStoredPresetIdForZone(localId, zoneRowKey);
  if (stored) return presetById(stored)!;
  const defId = defaultPresetIdForZone(zoneRowKey);
  return presetById(defId)!;
}

const lsEmpKey = (localId: string, zoneRowKey: string) => `chef-op-last-emp:${localId}:${zoneRowKey}`;

export function readLastEmployeeForZone(localId: string, zoneRowKey: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(lsEmpKey(localId, zoneRowKey));
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function writeLastEmployeeForZone(localId: string, zoneRowKey: string, employeeId: string): void {
  try {
    if (typeof window === 'undefined' || !employeeId.trim()) return;
    window.localStorage.setItem(lsEmpKey(localId, zoneRowKey), employeeId.trim());
  } catch {
    /* ignore */
  }
}
