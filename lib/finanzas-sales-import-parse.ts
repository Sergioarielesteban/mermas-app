import { parseOptionalMoney, parseOptionalInt } from '@/lib/finanzas-date-period-helpers';

export type ParsedSalesImportRow = {
  dateYmd: string;
  netSalesEur: number | null;
  ticketsCount: number | null;
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Normaliza fecha DD/MM/YYYY o YYYY-MM-DD a YYYY-MM-DD */
function normalizeDateCell(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (isYmd(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const d = m[1]!.padStart(2, '0');
    const mo = m[2]!.padStart(2, '0');
    const y = m[3]!;
    const ymd = `${y}-${mo}-${d}`;
    return isYmd(ymd) ? ymd : null;
  }
  return null;
}

function detectDelimiter(line: string): ';' | ',' {
  const semi = (line.match(/;/g) ?? []).length;
  const comma = (line.match(/,/g) ?? []).length;
  return semi >= comma ? ';' : ',';
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * CSV mínimo: fecha, ventas netas (€), tickets (opcional).
 * Acepta cabeceras en español: fecha, ventas, neto, tickets, etc.
 */
export function parseSalesImportCsv(text: string): { rows: ParsedSalesImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['El archivo está vacío.'] };
  }

  const delim = detectDelimiter(lines[0]!);
  const split = (line: string) => line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));

  const rawHeader = split(lines[0]!);
  const headerCells = rawHeader.map(normalizeHeader);
  const looksLikeHeader =
    headerCells.some((c) => c.includes('fecha')) ||
    headerCells.some((c) => c.includes('venta')) ||
    headerCells.some((c) => c.includes('neto'));

  let colDate = 0;
  let colNet = 1;
  let colTickets: number | null = 2;

  if (looksLikeHeader) {
    const find = (pred: (c: string) => boolean) => headerCells.findIndex(pred);
    const iDate = find((c) => c === 'fecha' || c.includes('dia'));
    const iNet = find((c) => c.includes('venta') || c.includes('neto') || c.includes('importe') || c === 'eur');
    const iTk = find((c) => c.includes('ticket'));
    if (iDate < 0 || iNet < 0) {
      return {
        rows: [],
        errors: [
          'Cabecera no reconocida. Usa columnas como: fecha, ventas (o neto), y opcionalmente tickets.',
        ],
      };
    }
    colDate = iDate;
    colNet = iNet;
    colTickets = iTk >= 0 ? iTk : null;
  }

  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const rows: ParsedSalesImportRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const cells = split(dataLines[i]!);
    const lineNo = looksLikeHeader ? i + 2 : i + 1;
    const dateRaw = cells[colDate] ?? '';
    const ymd = normalizeDateCell(dateRaw);
    if (!ymd) {
      errors.push(`Línea ${lineNo}: fecha no válida («${dateRaw}»). Usa YYYY-MM-DD o DD/MM/AAAA.`);
      continue;
    }
    const netStr = cells[colNet] ?? '';
    const net = parseOptionalMoney(netStr);
    if (net == null && netStr.trim() !== '') {
      errors.push(`Línea ${lineNo}: importe de ventas no válido («${netStr}»).`);
      continue;
    }
    let tickets: number | null = null;
    if (colTickets != null) {
      const tkStr = cells[colTickets] ?? '';
      if (tkStr.trim() !== '') {
        const tk = parseOptionalInt(tkStr);
        if (tk == null) {
          errors.push(`Línea ${lineNo}: tickets no válidos («${tkStr}»).`);
          continue;
        }
        tickets = tk;
      }
    }
    rows.push({ dateYmd: ymd, netSalesEur: net, ticketsCount: tickets });
  }

  return { rows, errors };
}
