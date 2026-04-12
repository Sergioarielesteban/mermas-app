/**
 * Nombre del local para cabecera: quita prefijo "CAN " si viene del catálogo (ej. "CAN XAMPA MATARO" → "XAMPA MATARO").
 */
export function formatLocalHeaderName(nameOrCode: string | null | undefined): string | null {
  if (nameOrCode == null || !String(nameOrCode).trim()) return null;
  const t = String(nameOrCode).trim();
  const stripped = t.replace(/^\s*CAN\s+/i, '').trim();
  return stripped.length > 0 ? stripped : t;
}
