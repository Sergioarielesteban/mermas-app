/**
 * Importación de ventas mensuales desde CSV / Excel para escandallos.
 * Columnas reconocidas (cabecera, sin tildes obligatorias):
 * - ID receta: recipe_id | id_receta | id (UUID)
 * - Código TPV: pos_article_code | codigo_tpv | codigo | articulo (si hay descripcion/nombre/… aparte)
 * - Nombre: nombre | plato | descripcion | …
 * - Unidades: unidades | cantidad | qty | …
 */

export type SalesImportRawRow = {
  recipeId?: string;
  /** Código artículo en el TPV (columna Articulo, etc.). */
  posArticleCode?: string;
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

/** Igual que en recetas: trim, sin espacios; numéricos sin ceros a la izquierda. */
export function normalizePosArticleCode(s: string): string {
  const t = stripDiacritics(s).trim().replace(/\s+/g, '');
  if (t === '') return '';
  if (/^\d+$/.test(t)) {
    const stripped = t.replace(/^0+/, '');
    return stripped === '' ? '0' : stripped;
  }
  return t.toLowerCase();
}

function headerMatches(norm: string, keys: string[]): boolean {
  return keys.some((k) => norm === k || norm.includes(k));
}

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function colExact(normHeaders: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = normHeaders.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function parseQty(v: unknown): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  let t = String(v).trim().replace(/\s/g, '');
  if (t === '') return NaN;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/i.test(t)) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(',', '.');
  }
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

function isFooterRowFirstCell(cell: string): boolean {
  const n = normalizeRecipeLabel(cell);
  if (n === '') return false;
  return (
    n === 'total' ||
    n.startsWith('total ') ||
    n === 'totales' ||
    n === 'suma' ||
    n === 'subtotal' ||
    n === 'importe' ||
    n === '---'
  );
}

function resolveCodeAndNameColumnIndices(headerCells: string[]): { codeIdx: number; nameIdx: number } {
  const nameBuddyKeys = ['descripcion', 'nombre', 'nombre_plato', 'plato', 'producto', 'name', 'product'];
  const hasNameBuddy = nameBuddyKeys.some((k) => headerCells.includes(k));

  let codeIdx = colExact(headerCells, [
    'pos_article_code',
    'codigo_tpv',
    'codigo_articulo',
    'ref_tpv',
    'sku_tpv',
    'articulo_tpv',
    'id_articulo',
    'codigo',
  ]);
  const articuloIdx = colExact(headerCells, ['articulo']);
  if (codeIdx < 0 && articuloIdx >= 0 && hasNameBuddy) codeIdx = articuloIdx;

  const nameFirst = colExact(headerCells, [
    'nombre',
    'nombre_plato',
    'plato',
    'producto',
    'name',
    'descripcion',
    'product',
  ]);
  let nameIdx = nameFirst;
  if (nameIdx < 0 && !(codeIdx === articuloIdx && articuloIdx >= 0) && articuloIdx >= 0) {
    nameIdx = articuloIdx;
  }
  return { codeIdx, nameIdx };
}

export function parseSalesImportCsv(text: string): { rows: SalesImportRawRow[]; error?: string } {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'El archivo está vacío o solo tiene cabecera.' };

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const idIdx = colExact(headerCells, ['recipe_id', 'id_receta', 'id']);
  const { codeIdx, nameIdx } = resolveCodeAndNameColumnIndices(headerCells);
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
  if (idIdx < 0 && nameIdx < 0 && codeIdx < 0) {
    return {
      rows: [],
      error:
        'Falta plato o código TPV. Incluye recipe_id, nombre/descripcion o codigo/articulo (export TPV), o la plantilla descargable.',
    };
  }

  const rows: SalesImportRawRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    if (cells.length && isFooterRowFirstCell(cells[0] ?? '')) continue;

    const recipeId = idIdx >= 0 ? (cells[idIdx] ?? '').trim() : undefined;
    const posRaw = codeIdx >= 0 ? (cells[codeIdx] ?? '').trim() : '';
    const posArticleCode = posRaw !== '' ? posRaw : undefined;
    const nameRaw = nameIdx >= 0 ? (cells[nameIdx] ?? '').trim() : '';
    const name = nameRaw !== '' ? nameRaw : undefined;
    const qty = parseQty(cells[qtyIdx]);
    if (!Number.isFinite(qty) || qty < 0) continue;
    if (qty === 0 && !recipeId && !name && !posArticleCode) continue;
    rows.push({
      recipeId: recipeId || undefined,
      posArticleCode,
      name,
      qty,
    });
  }
  return { rows };
}

function objectToRawRow(obj: Record<string, unknown>): SalesImportRawRow | null {
  const normMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    normMap.set(normalizeHeader(k), v);
  }
  const get = (key: string) => normMap.get(key);
  const firstTrimmed = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = get(k);
      const s = String(v ?? '').trim();
      if (s) return s;
    }
    return undefined;
  };

  let qty = NaN;
  for (const [nk, v] of normMap.entries()) {
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

  const hasNameBuddy = ['descripcion', 'nombre', 'nombre_plato', 'plato', 'producto', 'name', 'product'].some((k) =>
    normMap.has(k),
  );

  let posArticleCode = firstTrimmed(
    'pos_article_code',
    'codigo_tpv',
    'codigo_articulo',
    'ref_tpv',
    'sku_tpv',
    'articulo_tpv',
    'id_articulo',
    'codigo',
  );
  if (!posArticleCode && hasNameBuddy) {
    const a = get('articulo');
    if (a != null && String(a).trim()) posArticleCode = String(a).trim();
  }

  let name = firstTrimmed('nombre', 'nombre_plato', 'plato', 'producto', 'name', 'descripcion', 'product');
  if (!name && !posArticleCode) {
    const a = get('articulo');
    if (a != null && String(a).trim()) name = String(a).trim();
  }

  let recipeId = firstTrimmed('recipe_id', 'id_receta');
  if (!recipeId) {
    const idCell = get('id');
    if (idCell != null && String(idCell).trim()) recipeId = String(idCell).trim();
  }

  if (!Number.isFinite(qty) || qty < 0) return null;
  if (qty === 0 && !recipeId && !name && !posArticleCode) return null;
  if (!recipeId && !name && !posArticleCode) return null;
  return { recipeId, posArticleCode, name, qty };
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
        'No se leyeron filas con cantidad y plato/código. Revisa cabeceras o usa la plantilla (codigo TPV + nombre + unidades).',
    };
  }
  return { rows };
}

export function matchSalesImportToRecipes(
  raw: SalesImportRawRow[],
  mainRecipes: { id: string; name: string; posArticleCode?: string | null }[],
): SalesImportMatchedRow[] {
  const byId = new Map(mainRecipes.map((r) => [r.id, r]));
  const byNorm = new Map<string, string>();
  for (const r of mainRecipes) {
    const n = normalizeRecipeLabel(r.name);
    if (!byNorm.has(n)) byNorm.set(n, r.id);
  }
  const byPos = new Map<string, string>();
  for (const r of mainRecipes) {
    const c = r.posArticleCode;
    if (c == null || String(c).trim() === '') continue;
    const k = normalizePosArticleCode(String(c));
    if (k && !byPos.has(k)) byPos.set(k, r.id);
  }

  const out: SalesImportMatchedRow[] = [];
  let line = 2;
  for (const row of raw) {
    const rawLabel =
      [row.posArticleCode, row.name, row.recipeId].filter(Boolean).join(' · ') || '(vacío)';
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

    if (row.posArticleCode) {
      const pk = normalizePosArticleCode(row.posArticleCode);
      if (pk && byPos.has(pk)) {
        matchedId = byPos.get(pk)!;
        matchedName = byId.get(matchedId)!.name;
      }
    }

    if (!matchedId && row.recipeId) {
      const rid = row.recipeId.trim();
      if (looksLikeUuid(rid) && byId.has(rid)) {
        matchedId = rid;
        matchedName = byId.get(rid)!.name;
      } else {
        const pk = normalizePosArticleCode(rid);
        if (pk && byPos.has(pk)) {
          matchedId = byPos.get(pk)!;
          matchedName = byId.get(matchedId)!.name;
        }
      }
    }

    if (!matchedId && row.name) {
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

export function downloadSalesTemplateCsv(
  mainRecipes: { id: string; name: string; posArticleCode?: string | null }[],
  yearMonth: string,
) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = 'recipe_id,pos_article_code,nombre_plato,unidades_vendidas';
  const body = mainRecipes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((r) => {
      const code = r.posArticleCode?.trim() ?? '';
      return `${r.id},${code ? esc(code) : ''},${esc(r.name)},`;
    });
  const csv = ['\ufeff' + header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chef-one-ventas-plantilla-${yearMonth}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
