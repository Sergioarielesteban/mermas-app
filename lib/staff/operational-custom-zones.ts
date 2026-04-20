export type CustomOperationalZoneRow = { key: string; label: string };

function storageKey(localId: string) {
  return `mermas_operational_zone_rows_v1_${localId}`;
}

export function slugifyOperationalZoneKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base.length > 0 ? base : 'puesto';
}

export function readCustomOperationalZones(localId: string | null): CustomOperationalZoneRow[] {
  if (!localId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(localId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CustomOperationalZoneRow => {
        if (!x || typeof x !== 'object') return false;
        const o = x as Record<string, unknown>;
        return typeof o.key === 'string' && typeof o.label === 'string' && o.key.length > 0;
      })
      .map((x) => ({ key: x.key.trim().toLowerCase(), label: x.label.trim() }));
  } catch {
    return [];
  }
}

export function writeCustomOperationalZones(localId: string, rows: CustomOperationalZoneRow[]): void {
  if (!localId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(localId), JSON.stringify(rows));
}
