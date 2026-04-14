/**
 * Importación de ventas mensuales desde CSV / Excel para escandallos.
 * Columnas reconocidas (cabecera, sin tildes obligatorias):
 * - ID receta: recipe_id | id_receta | id
 * - Nombre: nombre | plato | producto | name | articulo | descripcion
 * - Unidades: unidades | cantidad | qty | vendidas | uds | unidades_vendidas | ventas
 */

export type SalesImportRawRow = {
  recipeId?: string;
  name?: string;
  qty: number;
};

export type SalesImportMatchedRow = {
  /**1-based línea en el archivo (incl. cabecera como línea 1). */
  sourceLine: number;
  rawLabel: string;
  qty: number;
  matchedRecipeId: string | null;
  matchedRecipeName: string | null;
  status: 'ok' | 'no_match' | 'bad_qty' | 'skipped';
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeader(h: string): string {
  return stripDiacritics(h).trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeRecipeLabel(s: string): string {
  return stripDiacritics(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function headerMatches(norm: string, keys: string[]): boolean {
  return keys.some((k) => norm === k || norm.includes(k));
}

function parseQty(v: unknown): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Parser CSV mínimo con comillas RFC-style. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function findColumnIndex(headers: string[], keys: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (headerMatches(h, keys)) return i;
  }
  return -1;
}

export function parseSalesImportCsv(text: string): { rows: SalesImportRawRow[]; error?: string } {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'El archivo está vacío o solo tiene cabecera.' };

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const idIdx = findColumnIndex(headerCells, ['recipe_id', 'id_receta', 'id']);
  const nameIdx = findColumnIndex(headerCells, [
    'nombre',
    'nombre_plato',
    'plato',
    'producto',
    'name',
    'articulo',
    'descripcion',
    'product',
  ]);
  const qtyIdx = findColumnIndex(headerCells, [
    'unidades',
    'unidades_vendidas',
    'cantidad',
    'qty',
    'vendidas',
    'uds',
    'ventas',
    'units',
  ]);

  if (qtyIdx < 0) {
    return {
      rows: [],
      error:
        'No encuentro columna de cantidad. Usa una cabecera como: unidades, cantidad, vendidas o uds.',
    };
  }
  if (idIdx < 0 && nameIdx < 0) {
    return {
      rows: [],
      error:
        'Falta columna de plato. Incluye recipe_id o nombre / plato / producto (o usa la plantilla descargable).',
    };
  }

  const rows: SalesImportRawRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const recipeId = idIdx >= 0 ? (cells[idIdx] ?? '').trim() : undefined;
    const name = nameIdx >= 0 ? (cells[nameIdx] ?? '').trim() : undefined;
    const qty = parseQty(cells[qtyIdx]);
    if (!Number.isFinite(qty) || qty < 0) continue;
    if (qty === 0 && !recipeId && !name) continue;
    rows.push({
      recipeId: recipeId || undefined,
      name: name || undefined,
      qty,
    });
  }
  return { rows };
}

function objectToRawRow(obj: Record<string, unknown>): SalesImportRawRow | null {
  let recipeId: string | undefined;
  let name: string | undefined;
  let qty = NaN;
  for (const [k, v] of Object.entries(obj)) {
    const nk = normalizeHeader(k);
    if (headerMatches(nk, ['recipe_id', 'id_receta', 'id'])) {
      const s = String(v ?? '').trim();
      if (s) recipeId = s;
    }
    if (
      headerMatches(nk, [
        'nombre',
        'nombre_plato',
        'plato',
        'producto',
        'name',
        'articulo',
        'descripcion',
        'product',
      ])
    ) {
      const s = String(v ?? '').trim();
      if (s) name = s;
    }
    if (
      headerMatches(nk, [
        'unidades',
        'unidades_vendidas',
        'cantidad',
        'qty',
        'vendidas',
        'uds',
        'ventas',
        'units',
      ])
    ) {
      qty = parseQty(v);
    }
  }
  if (!Number.isFinite(qty) || qty < 0) return null;
  if (qty === 0 && !recipeId && !name) return null;
  if (!recipeId && !name) return null;
  return { recipeId, name, qty };
}

export async function parseSalesImportExcel(buffer: ArrayBuffer): Promise<{ rows: SalesImportRawRow[]; error?: string }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return { rows: [], error: 'El Excel no tiene hojas.' };
  const sheet = wb.Sheets[first];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const rows: SalesImportRawRow[] = [];
  for (const row of data) {
    const r = objectToRawRow(row);
    if (r) rows.push(r);
  }
  if (rows.length === 0) {
    return {
      rows: [],
      error:
        'No se leyeron filas con cantidad y plato. Revisa cabeceras (nombre/plato + unidades) o usa la plantilla.',
    };
  }
  return { rows };
}

export function matchSalesImportToRecipes(
  raw: SalesImportRawRow[],
  mainRecipes: { id: string; name: string }[],
): SalesImportMatchedRow[] {
  const byId = new Map(mainRecipes.map((r) => [r.id, r]));
  const byNorm = new Map<string, string>();
  for (const r of mainRecipes) {
    const n = normalizeRecipeLabel(r.name);
    if (!byNorm.has(n)) byNorm.set(n, r.id);
  }

  const out: SalesImportMatchedRow[] = [];
  let line = 2;
  for (const row of raw) {
    const rawLabel = row.name ?? row.recipeId ?? '';
    if (!Number.isFinite(row.qty) || row.qty < 0) {
      out.push({
        sourceLine: line,
        rawLabel,
        qty: row.qty,
        matchedRecipeId: null,
        matchedRecipeName: null,
        status: 'bad_qty',
      });
      line++;
      continue;
    }
    if (row.qty === 0) {
      out.push({
        sourceLine: line,
        rawLabel,
        qty: 0,
        matchedRecipeId: null,
        matchedRecipeName: null,
        status: 'skipped',
      });
      line++;
      continue;
    }

    let matchedId: string | null = null;
    let matchedName: string | null = null;
    if (row.recipeId && byId.has(row.recipeId)) {
      matchedId = row.recipeId;
      matchedName = byId.get(row.recipeId)!.name;
    } else if (row.name) {
      const n = normalizeRecipeLabel(row.name);
      if (byNorm.has(n)) {
        matchedId = byNorm.get(n)!;
        matchedName = byId.get(matchedId)!.name;
      }
    }

    out.push({
      sourceLine: line,
      rawLabel,
      qty: row.qty,
      matchedRecipeId: matchedId,
      matchedRecipeName: matchedName,
      status: matchedId ? 'ok' : 'no_match',
    });
    line++;
  }
  return out;
}

export function downloadSalesTemplateCsv(mainRecipes: { id: string; name: string }[], yearMonth: string) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = 'recipe_id,nombre_plato,unidades_vendidas';
  const body = mainRecipes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((r) => `${r.id},${esc(r.name)},`);
  const csv = ['\ufeff' + header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chef-one-ventas-plantilla-${yearMonth}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
