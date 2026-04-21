import { STAFF_ZONE_PRESETS } from '@/lib/staff/types';
import { zoneLabel } from '@/lib/staff/staff-zone-styles';

export type CustomOperationalZoneRow = { key: string; label: string };

/** Orden base de filas del cuadrante (claves canónicas en BD). */
export const OPERATIONAL_REGISTRY_BASE_ORDER = ['cocina', 'barra', 'sala', 'cocina_central'] as const;

const STORAGE_V1 = (localId: string) => `mermas_operational_zone_rows_v1_${localId}`;
const STORAGE_V2 = (localId: string) => `mermas_operational_zone_registry_v2_${localId}`;

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

/** Lista por defecto: puestos estándar + presets no duplicados (sin «Sin puesto»). */
export function defaultOperationalZoneRegistry(): CustomOperationalZoneRow[] {
  const seen = new Set<string>();
  const rows: CustomOperationalZoneRow[] = [];
  for (const k of OPERATIONAL_REGISTRY_BASE_ORDER) {
    rows.push({ key: k, label: zoneLabel(k) });
    seen.add(k);
  }
  for (const p of STAFF_ZONE_PRESETS) {
    const k = p.value.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    rows.push({ key: k, label: p.label });
    seen.add(k);
  }
  return rows;
}

function parseRows(raw: unknown): CustomOperationalZoneRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is CustomOperationalZoneRow => {
      if (!x || typeof x !== 'object') return false;
      const o = x as Record<string, unknown>;
      return typeof o.key === 'string' && typeof o.label === 'string' && o.key.length > 0;
    })
    .map((x) => ({ key: x.key.trim().toLowerCase(), label: x.label.trim() }))
    .filter((x) => x.key !== '__none__');
}

/** Fusiona datos legacy v1 sobre el registro por defecto y añade claves extra al final. */
export function mergeV1ZonesIntoDefaultRegistry(v1: CustomOperationalZoneRow[]): CustomOperationalZoneRow[] {
  const v1m = new Map(v1.map((r) => [r.key.trim().toLowerCase(), r.label.trim()] as const));
  const base = defaultOperationalZoneRegistry();
  const out: CustomOperationalZoneRow[] = base.map((b) => ({
    key: b.key,
    label: v1m.get(b.key) ?? b.label,
  }));
  const seen = new Set(out.map((r) => r.key));
  for (const r of v1) {
    const k = r.key.trim().toLowerCase();
    if (!k || k === '__none__' || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, label: r.label.trim() });
  }
  return out;
}

/** Lee el registro v2; si no existe, migra desde v1 (o usa por defecto) y persiste v2 una vez. */
export function readOperationalZoneRegistry(localId: string | null): CustomOperationalZoneRow[] {
  if (!localId || typeof window === 'undefined') return defaultOperationalZoneRegistry();
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_V2(localId));
    if (rawV2) {
      try {
        const parsed = JSON.parse(rawV2) as unknown;
        const rows = parseRows(parsed);
        if (rows.length > 0) return rows;
      } catch {
        /* continuar a migración / defecto */
      }
    }
    const rawV1 = window.localStorage.getItem(STORAGE_V1(localId));
    let merged: CustomOperationalZoneRow[];
    if (rawV1) {
      try {
        const v1 = parseRows(JSON.parse(rawV1) as unknown);
        merged = v1.length > 0 ? mergeV1ZonesIntoDefaultRegistry(v1) : defaultOperationalZoneRegistry();
      } catch {
        merged = defaultOperationalZoneRegistry();
      }
    } else {
      merged = defaultOperationalZoneRegistry();
    }
    window.localStorage.setItem(STORAGE_V2(localId), JSON.stringify(merged));
    return merged;
  } catch {
    return defaultOperationalZoneRegistry();
  }
}

export function writeOperationalZoneRegistry(localId: string, rows: CustomOperationalZoneRow[]): void {
  if (!localId || typeof window === 'undefined') return;
  const cleaned = rows
    .map((r) => ({ key: r.key.trim().toLowerCase(), label: r.label.trim() }))
    .filter((r) => r.key.length > 0 && r.key !== '__none__');
  window.localStorage.setItem(STORAGE_V2(localId), JSON.stringify(cleaned));
}

/** @deprecated Usar readOperationalZoneRegistry; se mantiene por compatibilidad con datos v1 sin v2. */
export function readCustomOperationalZones(localId: string | null): CustomOperationalZoneRow[] {
  return readOperationalZoneRegistry(localId);
}

/** @deprecated Usar writeOperationalZoneRegistry */
export function writeCustomOperationalZones(localId: string, rows: CustomOperationalZoneRow[]): void {
  writeOperationalZoneRegistry(localId, rows);
}
