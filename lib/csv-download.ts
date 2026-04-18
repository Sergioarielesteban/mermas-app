/** Descarga CSV (UTF-8 con BOM para Excel). Solo para uso en cliente. */
export function downloadCsvFile(
  filename: string,
  columns: { key: string; header: string }[],
  rows: Record<string, string | number | null | undefined>[],
) {
  const esc = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
