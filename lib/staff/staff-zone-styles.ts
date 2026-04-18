/** Colores de bloque por puesto (hostelería). Coherente en cuadrante y leyenda. */
export type ZoneBlockStyle = {
  bg: string;
  text: string;
  subtleBg: string;
};

const DEFAULT_STYLE: ZoneBlockStyle = {
  bg: '#52525b',
  text: '#ffffff',
  subtleBg: '#f4f4f5',
};

const BY_ZONE: Record<string, ZoneBlockStyle> = {
  cocina: { bg: '#ea580c', text: '#ffffff', subtleBg: '#ffedd5' },
  sala: { bg: '#16a34a', text: '#ffffff', subtleBg: '#dcfce7' },
  barra: { bg: '#2563eb', text: '#ffffff', subtleBg: '#dbeafe' },
  office: { bg: '#7c3aed', text: '#ffffff', subtleBg: '#ede9fe' },
  reparto: { bg: '#ca8a04', text: '#ffffff', subtleBg: '#fef9c3' },
  almacen: { bg: '#64748b', text: '#ffffff', subtleBg: '#f1f5f9' },
};

/** Hex para guardar en `color_hint` al elegir puesto (opcional en editor). */
export function zoneDefaultColorHint(zone: string | null | undefined): string | null {
  const z = zone?.trim().toLowerCase();
  if (!z) return null;
  return BY_ZONE[z]?.bg ?? null;
}

export function zoneBlockStyle(zone: string | null | undefined): ZoneBlockStyle {
  const z = zone?.trim().toLowerCase();
  if (z && BY_ZONE[z]) return BY_ZONE[z];
  return DEFAULT_STYLE;
}

export function zoneLabel(zone: string | null | undefined): string {
  if (!zone?.trim()) return '';
  const z = zone.trim().toLowerCase();
  const labels: Record<string, string> = {
    cocina: 'Cocina',
    sala: 'Sala',
    barra: 'Barra',
    office: 'Office',
    reparto: 'Reparto',
    almacen: 'Almacén',
  };
  return labels[z] ?? zone;
}
