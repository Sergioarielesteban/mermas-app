import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { type RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import { totalInputWeightKg } from '@/lib/escandallo-input-weight';
import {
  computeMermaPct,
  computeOperationalCost,
  computeYieldCostPerUnit,
} from '@/lib/escandallo-operational-usage';
import type {
  EscandalloTechnicalSheet,
  EscandalloTechnicalSheetStep,
} from '@/lib/escandallos-technical-sheet-supabase';
import { getOfficialRecipePhotoUrl } from '@/lib/escandallos-technical-sheet-supabase';
import {
  foodCostPercentOfNetSale,
  lineUnitPriceEur,
  saleNetPerUnitFromGross,
  type EscandalloLine,
  type EscandalloProcessedProduct,
  type EscandalloRawProduct,
  type EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import { formatMoneyEur } from '@/lib/money-format';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
type LogoAsset = { dataUrl: string; width: number; height: number };
type PhotoAsset = { dataUrl: string; aspect: number };

export type RecipePrintPayload = {
  recipe: EscandalloRecipe;
  lines: EscandalloLine[];
  sheet: EscandalloTechnicalSheet | null;
  steps: EscandalloTechnicalSheetStep[];
  recipeAllergens: RecipeAllergenRow[];
  rawById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  recipesById: Map<string, EscandalloRecipe>;
  technicalSheetsByRecipe: Map<string, EscandalloTechnicalSheet>;
  centralKitchenById: Map<string, EscandalloCentralKitchenCatalogItem>;
  linesByRecipe: Record<string, EscandalloLine[]>;
  productionTotalCost: number;
  creatorName?: string | null;
  localName?: string | null;
};

// ─── Page geometry (pt, A4 portrait 595.28 × 841.89) ─────────────────────────

const PW = 595.28;
const PH = 841.89;
const MM = 2.8346456693;
const MX = Math.round(12 * MM);         // side margin ~34pt
const CW = PW - MX * 2;                 // content width ~527pt
const SAFE_B = PH - Math.round(14 * MM) - 14;  // safe bottom before page break

// ─── Palette ──────────────────────────────────────────────────────────────────

const WHITE: RGB  = [255, 255, 255];
const INK: RGB    = [18, 14, 10];
const MUTED: RGB  = [138, 126, 112];
const FAINT: RGB  = [220, 213, 203];     // divider lines
const CREAM: RGB  = [249, 245, 241];     // alternating row bg
const TERRA: RGB  = [196, 83, 31];       // Chef One brand accent
const OLIVE: RGB  = [74, 107, 58];
const GOLD: RGB   = [184, 135, 42];
const PALE_T: RGB = [253, 244, 241];

// ─── Hero layout constants ────────────────────────────────────────────────────

const PHOTO_W_RATIO = 0.44;             // photo takes 44% of content width
const PHOTO_COL_W   = Math.round(CW * PHOTO_W_RATIO);
const META_X        = MX + PHOTO_COL_W + 14;
const META_W        = CW - PHOTO_COL_W - 14;
const HERO_H        = 192;              // fixed hero zone height (pt)

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtQty(v: number | null | undefined, max = 3): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-ES', { maximumFractionDigits: max });
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}
function safe(v: string | null | undefined, fb = ''): string {
  return String(v ?? '').trim() || fb;
}
function safeFileName(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .toLowerCase().slice(0, 80) || 'receta';
}
function printDate(): string {
  return new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Recipe kind ─────────────────────────────────────────────────────────────

function recipeKind(r: EscandalloRecipe, s: EscandalloTechnicalSheet | null): 'PLATO' | 'BASE' | 'ELABORACIÓN' {
  if (!r.isSubRecipe) return 'PLATO';
  if (`${s?.categoria ?? ''}`.toLowerCase().includes('elabor')) return 'ELABORACIÓN';
  return 'BASE';
}
function kindColor(k: 'PLATO' | 'BASE' | 'ELABORACIÓN'): RGB {
  return k === 'PLATO' ? TERRA : k === 'BASE' ? OLIVE : GOLD;
}

// ─── Cost helpers (unchanged logic) ──────────────────────────────────────────

function lineCost(line: EscandalloLine, p: RecipePrintPayload): number {
  const u = lineUnitPriceEur(line, p.rawById, p.processedById, {
    linesByRecipe: p.linesByRecipe,
    recipesById: p.recipesById,
    technicalSheetsByRecipe: p.technicalSheetsByRecipe,
    centralKitchenById: p.centralKitchenById,
    expanding: new Set([p.recipe.id]),
  });
  return Math.round(line.qty * u * 10000) / 10000;
}

function productionValues(p: RecipePrintPayload) {
  const { recipe, sheet, productionTotalCost, rawById, lines } = p;
  const kind = recipeKind(recipe, sheet);
  const outputQty =
    sheet?.yieldQuantity != null && sheet.yieldQuantity > 0 ? sheet.yieldQuantity
    : recipe.finalWeightQty != null && recipe.finalWeightQty > 0 ? recipe.finalWeightQty
    : recipe.yieldQty > 0 ? recipe.yieldQty : null;
  const outputUnit = sheet?.yieldUnit ?? recipe.finalWeightUnit ?? recipe.yieldLabel ?? 'ración';
  const costPerYield =
    sheet?.yieldCostPerUnit != null && Number.isFinite(sheet.yieldCostPerUnit)
      ? sheet.yieldCostPerUnit
      : computeYieldCostPerUnit(productionTotalCost, outputQty);
  const inputKg = (() => { const w = totalInputWeightKg(lines, rawById); return w.kg > 0 ? w.kg : null; })();
  const mermaPct =
    sheet?.yieldMermaPct != null && Number.isFinite(sheet.yieldMermaPct) ? sheet.yieldMermaPct
    : inputKg != null && outputQty != null ? computeMermaPct(inputKg, 'kg', outputQty, outputUnit) : null;
  const operationalCost =
    sheet?.operationalCost != null && Number.isFinite(sheet.operationalCost) ? sheet.operationalCost
    : computeOperationalCost(costPerYield, outputUnit, sheet?.operationalQuantity, sheet?.operationalUnit);
  const netSale =
    !recipe.isSubRecipe && recipe.salePriceGrossEur != null && recipe.salePriceGrossEur > 0
      ? saleNetPerUnitFromGross(recipe.salePriceGrossEur, recipe.saleVatRatePct ?? 10)
      : null;
  const foodCost = !recipe.isSubRecipe
    ? foodCostPercentOfNetSale(productionTotalCost, recipe.yieldQty || 1, netSale)
    : null;
  const margin = foodCost != null ? Math.round((100 - foodCost) * 10) / 10 : null;
  return {
    kind, outputQty, outputUnit, costPerYield, operationalCost,
    inputKg, mermaPct, foodCost, margin,
    pvpGross: !recipe.isSubRecipe && recipe.salePriceGrossEur && recipe.salePriceGrossEur > 0
      ? recipe.salePriceGrossEur : null,
  };
}

function lineSourceTag(line: EscandalloLine): string {
  if (line.sourceType === 'subrecipe') return 'BASE';
  if (line.sourceType === 'processed') return 'ELAB.';
  if (line.sourceType === 'central_kitchen') return 'C.CENTRAL';
  if (line.sourceType === 'manual') return 'MANUAL';
  return '';
}

function lineSupplierName(line: EscandalloLine, rawById: Map<string, EscandalloRawProduct>): string | null {
  if (line.sourceType === 'raw' && line.rawSupplierProductId) {
    return rawById.get(line.rawSupplierProductId)?.supplierName ?? null;
  }
  return null;
}

function fcTone(v: number | null): RGB {
  if (v == null) return INK;
  return v <= 30 ? OLIVE : v <= 35 ? GOLD : TERRA;
}
function marginTone(v: number | null): RGB {
  if (v == null) return INK;
  return v >= 65 ? OLIVE : v >= 55 ? GOLD : TERRA;
}

// ─── Asset loaders ────────────────────────────────────────────────────────────

let _logoP: Promise<LogoAsset | null> | null = null;

async function loadLogo(): Promise<LogoAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (_logoP) return _logoP;
  _logoP = (async () => {
    try {
      const res = await fetch('/logo-oficial-chef.svg');
      if (!res.ok) return null;
      const svg = (await res.text()).replace(/<rect\b[^>]*fill="#ffffff"[^>]*\/>/gi, '');
      const img = new Image();
      const enc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const loaded = await new Promise<HTMLImageElement | null>((ok) => {
        img.onload = () => ok(img); img.onerror = () => ok(null); img.src = enc;
      });
      if (!loaded || loaded.naturalWidth <= 0) return null;
      const c = document.createElement('canvas'); c.width = 538; c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 538, 128);
      const sx = (53 / 375) * loaded.naturalWidth, sy = (154 / 375) * loaded.naturalHeight;
      const sw = (269 / 375) * loaded.naturalWidth, sh = (64 / 375) * loaded.naturalHeight;
      ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, 538, 128);
      return { dataUrl: c.toDataURL('image/png'), width: 538, height: 128 };
    } catch { return null; }
  })();
  return _logoP;
}

async function loadPhoto(src: string | null | undefined): Promise<PhotoAsset | null> {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    const norm = src.trim();
    if (!norm.startsWith('data:') && !norm.startsWith('blob:') && !norm.startsWith('/'))
      img.crossOrigin = 'anonymous';
    const loaded = await new Promise<HTMLImageElement | null>((ok) => {
      img.onload = () => ok(img); img.onerror = () => ok(null); img.src = norm;
    });
    if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;
    const aspect = loaded.naturalHeight / loaded.naturalWidth;
    const c = document.createElement('canvas');
    c.width = 900; c.height = Math.round(aspect * 900);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(loaded, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), aspect };
  } catch { return null; }
}

// ─── Low-level drawing ────────────────────────────────────────────────────────

function rule(doc: jsPDF, y: number, x0 = MX, x1 = PW - MX, color: RGB = FAINT, lw = 0.35): void {
  doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(x0, y, x1, y);
}

function sectionTitle(doc: jsPDF, x: number, y: number, text: string, extend?: number): void {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...TERRA);
  doc.text(text.toUpperCase(), x, y);
  const tw = doc.getTextWidth(text.toUpperCase()) as number;
  const lineEnd = extend != null ? x + extend : PW - MX;
  if (lineEnd > x + tw + 8) {
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.3);
    doc.line(x + tw + 5, y - 1.5, lineEnd, y - 1.5);
  }
}

function drawContainedPhoto(doc: jsPDF, asset: PhotoAsset, bx: number, by: number, bw: number, bh: number): void {
  const imgW = asset.aspect <= bh / bw ? bw : bh / asset.aspect;
  const imgH = imgW * asset.aspect;
  doc.addImage(asset.dataUrl, 'JPEG', bx + (bw - imgW) / 2, by + (bh - imgH) / 2, imgW, imgH);
}

function needsNewPage(doc: jsPDF, y: number, needed: number, logo: LogoAsset | null, recipeName: string): number {
  if (y + needed <= SAFE_B) return y;
  doc.addPage();
  drawPageBackground(doc);
  drawContinuationHeader(doc, logo, recipeName);
  return Math.round(6 * MM) + 26;
}

// ─── Page chrome ─────────────────────────────────────────────────────────────

function drawPageBackground(doc: jsPDF): void {
  doc.setFillColor(...WHITE); doc.rect(0, 0, PW, PH, 'F');
}

function drawFooter(doc: jsPDF, page: number, total: number, qrDataUrl: string | null): void {
  const fy = PH - 9;
  rule(doc, fy - 6, MX, PW - MX, FAINT, 0.3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(...MUTED);
  doc.text(`Impreso: ${printDate()}`, MX, fy);
  doc.text(`Página ${page} / ${total}`, PW - MX, fy, { align: 'right' });
  // QR only on last page, inline in footer
  if (page === total && qrDataUrl) {
    const qSize = 20;
    const qx = PW / 2 - qSize / 2;
    doc.addImage(qrDataUrl, 'PNG', qx, fy - qSize - 2, qSize, qSize);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(...MUTED);
    doc.text('Accede a esta receta en Chef One', PW / 2, fy - 1, { align: 'center' });
  }
}

function drawContinuationHeader(doc: jsPDF, logo: LogoAsset | null, recipeName: string): void {
  const LOGO_W = 66; const yTop = Math.round(3 * MM);
  if (logo) {
    const lh = (LOGO_W * logo.height) / logo.width;
    doc.addImage(logo.dataUrl, 'PNG', MX, yTop, LOGO_W, lh);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TERRA);
    doc.text('Chef One', MX, yTop + 10);
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK);
  doc.text(safe(recipeName, 'Receta'), MX + 74, yTop + 10, { maxWidth: CW - 80 });
  rule(doc, yTop + 16, MX, PW - MX, FAINT, 0.4);
}

// ─── Page 1 hero zone ─────────────────────────────────────────────────────────

function buildHero(
  doc: jsPDF,
  payload: RecipePrintPayload,
  logo: LogoAsset | null,
  photo: PhotoAsset | null,
): number {
  const { recipe, sheet } = payload;
  const vals = productionValues(payload);
  const kind = recipeKind(recipe, sheet);
  const kColor = kindColor(kind);
  const hasPhoto = photo != null;

  drawPageBackground(doc);

  // ─ Top strip: logo left, local name right ──────────────────────────────────
  const LOGO_W = 96;
  const LOGO_Y = Math.round(3.5 * MM);
  if (logo) {
    const lh = (LOGO_W * logo.height) / logo.width;
    doc.addImage(logo.dataUrl, 'PNG', MX, LOGO_Y, LOGO_W, lh);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TERRA);
    doc.text('Chef One', MX, LOGO_Y + 14);
  }
  if (payload.localName?.trim()) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
    doc.text(safe(payload.localName), PW - MX, LOGO_Y + 10, { align: 'right' });
  }
  const STRIP_RULE_Y = LOGO_Y + Math.round(8 * MM) + 4;
  rule(doc, STRIP_RULE_Y, MX, PW - MX, TERRA, 0.6);

  // ─ Hero starts below strip ─────────────────────────────────────────────────
  const HERO_Y = STRIP_RULE_Y + 10;

  // Photo zone
  if (hasPhoto) {
    drawContainedPhoto(doc, photo, MX, HERO_Y, PHOTO_COL_W, HERO_H);
  }

  // Right (or full-width if no photo) metadata column
  const metaX = hasPhoto ? META_X : MX;
  const metaW = hasPhoto ? META_W : CW;
  let my = HERO_Y;

  // Kind badge
  const kindLabel = kind;
  const badgeW = (doc.getTextWidth(kindLabel) as number) + 16;
  doc.setFillColor(...kColor);
  doc.roundedRect(metaX, my, badgeW, 13, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...WHITE);
  doc.text(kindLabel, metaX + badgeW / 2, my + 9, { align: 'center' });

  // Status badge
  const isActive = sheet?.activa !== false;
  const statusLabel = isActive ? 'ACTIVA' : 'INACTIVA';
  const sFg: RGB = isActive ? OLIVE : TERRA;
  const statusX = metaX + badgeW + 6;
  const statusW = (doc.getTextWidth(statusLabel) as number) + 14;
  doc.setFillColor(...WHITE); doc.setDrawColor(...sFg); doc.setLineWidth(0.4);
  doc.roundedRect(statusX, my, statusW, 13, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...sFg);
  doc.text(statusLabel, statusX + statusW / 2, my + 9, { align: 'center' });

  my += 19;

  // Recipe name (protagonist)
  doc.setFont('times', 'bold');
  doc.setFontSize(hasPhoto ? 21 : 26);
  doc.setTextColor(...INK);
  const nameLines = (doc.splitTextToSize(safe(recipe.name, 'Sin nombre'), metaW) as string[]).slice(0, 2);
  doc.text(nameLines, metaX, my + 18);
  my += nameLines.length * 20 + 4;

  // Family
  const family = safe(sheet?.categoria, '');
  if (family) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(family, metaX, my);
    my += 11;
  }

  // Yield
  const yieldStr = `${fmtQty(recipe.yieldQty, 1)} ${safe(recipe.yieldLabel, 'ración')}`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text(yieldStr, metaX, my);
  my += 14;

  // Thin rule before metrics
  rule(doc, my, metaX, metaX + metaW, FAINT, 0.3);
  my += 10;

  // Metrics grid (only non-null values)
  type MetricEntry = { label: string; value: string; tone: RGB };
  const metrics: MetricEntry[] = [];
  if (vals.costPerYield != null)
    metrics.push({ label: 'Coste / ración', value: `${formatMoneyEur(vals.costPerYield)}`, tone: INK });
  if (vals.pvpGross != null)
    metrics.push({ label: 'PVP', value: formatMoneyEur(vals.pvpGross), tone: INK });
  if (vals.foodCost != null)
    metrics.push({ label: 'Food cost', value: fmtPct(vals.foodCost), tone: fcTone(vals.foodCost) });
  if (vals.margin != null)
    metrics.push({ label: 'Margen', value: fmtPct(vals.margin), tone: marginTone(vals.margin) });

  if (metrics.length > 0) {
    const COLS = Math.min(metrics.length, 2);
    const cellW = metaW / COLS;
    const CELL_H = 32;
    metrics.forEach((m, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = metaX + col * cellW;
      const cy = my + row * CELL_H;
      if (col > 0) {
        rule(doc, cy + 4, cx - 5, cx - 5, FAINT, 0.3);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
      doc.text(m.label.toUpperCase(), cx, cy + 7);
      doc.setFont('times', 'bold'); doc.setFontSize(14); doc.setTextColor(...m.tone);
      doc.text(m.value, cx, cy + 22);
    });
    my += Math.ceil(metrics.length / COLS) * CELL_H + 6;
  }

  // Notes/description (if space remains and there are notes)
  const notesSrc = safe(sheet?.notasChef ?? recipe.notes, '');
  const heroBottom = HERO_Y + HERO_H;
  if (notesSrc && my < heroBottom - 20) {
    rule(doc, my, metaX, metaX + metaW, FAINT, 0.25);
    my += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const noteLines = (doc.splitTextToSize(notesSrc, metaW) as string[])
      .slice(0, Math.floor((heroBottom - my) / 9));
    doc.text(noteLines, metaX, my);
  }

  return HERO_Y + HERO_H + 14;
}

// ─── Ingredients (editorial list) ────────────────────────────────────────────

function addIngredients(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  if (payload.lines.length === 0) return y;

  y = needsNewPage(doc, y, 48, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, `Ingredientes  (${payload.lines.length})`);
  y += 16;

  // Column widths
  const QTY_W  = 46;  // qty + unit, right-aligned
  const COST_W = 52;  // cost, right-aligned
  const GAP    = 6;
  const NAME_W = CW - QTY_W - COST_W - GAP * 2;

  const NAME_X = MX + QTY_W + GAP;
  const COST_X = MX + CW;
  const ROW_H  = 12;
  const SUB_H  = 9;

  for (const [idx, line] of payload.lines.entries()) {
    const supplier = lineSupplierName(line, payload.rawById);
    const rowTotal = ROW_H + (supplier ? SUB_H : 0);
    y = needsNewPage(doc, y, rowTotal + 2, logo, payload.recipe.name);

    // Subtle alternating row
    if (idx % 2 === 0) {
      doc.setFillColor(...CREAM);
      doc.rect(MX, y - 2, CW, rowTotal + 2, 'F');
    }

    // Qty + unit
    const qtyStr = `${fmtQty(line.qty, 3)} ${String(line.unit)}`;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(qtyStr, MX + QTY_W, y + 7.5, { align: 'right' });

    // Ingredient name
    const tag = lineSourceTag(line);
    const rawName = (() => {
      const sep = line.label.indexOf(' · ');
      return sep > 0 ? line.label.slice(sep + 3) : line.label;
    })();
    const displayName = tag ? `${rawName}  · ${tag}` : rawName;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    const nameText = (doc.splitTextToSize(displayName, NAME_W) as string[])[0] ?? '';
    doc.text(nameText, NAME_X, y + 7.5);

    // Cost
    const costStr = formatMoneyEur(lineCost(line, payload));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    doc.text(costStr, COST_X, y + 7.5, { align: 'right' });

    // Dots fill
    const nameEndX = NAME_X + (doc.getTextWidth(nameText) as number);
    const costStartX = COST_X - (doc.getTextWidth(costStr) as number);
    const dotStart = nameEndX + 3;
    const dotEnd = costStartX - 3;
    if (dotEnd > dotStart + 5) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...FAINT);
      const dw = doc.getTextWidth('. ') as number;
      const n = Math.floor((dotEnd - dotStart) / dw);
      if (n > 0) doc.text('. '.repeat(n), dotStart, y + 7);
    }

    // Supplier sub-line
    if (supplier) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...MUTED);
      doc.text(supplier, NAME_X, y + ROW_H + 4);
    }

    y += rowTotal + 1;
  }

  y += 5;

  // Total cost band
  y = needsNewPage(doc, y, 20, logo, payload.recipe.name);
  doc.setFillColor(...PALE_T);
  doc.rect(MX, y, CW, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TERRA);
  doc.text('COSTE TOTAL PRODUCCIÓN', MX + 8, y + 13);
  doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...TERRA);
  doc.text(formatMoneyEur(payload.productionTotalCost), MX + CW - 8, y + 13, { align: 'right' });

  return y + 26;
}

// ─── Production summary (only if data) ───────────────────────────────────────

function addProduction(doc: jsPDF, payload: RecipePrintPayload, vals: ReturnType<typeof productionValues>, y: number, logo: LogoAsset | null): number {
  const rows: [string, string][] = [];
  if (vals.inputKg != null) rows.push(['Entrada total', `${fmtQty(vals.inputKg, 3)} kg`]);
  if (vals.outputQty != null) rows.push(['Salida', `${fmtQty(vals.outputQty)} ${vals.outputUnit}`]);
  if (vals.mermaPct != null) rows.push(['Merma', fmtPct(vals.mermaPct)]);
  if (rows.length === 0) return y;

  y = needsNewPage(doc, y, 38, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, 'Producción');
  y += 15;

  const colW = CW / rows.length;
  rows.forEach(([label, value], i) => {
    const x = MX + i * colW;
    if (i > 0) rule(doc, y + 10, x - 5, x - 5, FAINT, 0.25);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(value, x, y + 13);
  });

  return y + 24;
}

// ─── Elaboración steps ────────────────────────────────────────────────────────

function addSteps(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  y = needsNewPage(doc, y, 36, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, 'Elaboración');
  y += 16;

  if (payload.steps.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text('Sin pasos definidos.', MX, y);
    return y + 14;
  }

  const NUM_W = 22;
  const TEXT_X = MX + NUM_W + 6;
  const TEXT_W = CW - NUM_W - 6;
  const R = 7; // circle radius

  for (const [idx, step] of payload.steps.entries()) {
    const text = safe(`${step.titulo ? `${step.titulo}: ` : ''}${step.descripcion}`, '');
    if (!text) continue;
    const lines = doc.splitTextToSize(text, TEXT_W) as string[];
    const stepH = Math.max(20, lines.length * 9.5 + 6);
    y = needsNewPage(doc, y, stepH + 4, logo, payload.recipe.name);

    const cy = y + R + 1;
    doc.setFillColor(...TERRA);
    doc.circle(MX + R, cy, R, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(idx + 1 >= 10 ? 6.5 : 7.5);
    doc.setTextColor(...WHITE);
    doc.text(String(idx + 1), MX + R, cy + 3, { align: 'center' });

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK);
    doc.text(lines, TEXT_X, y + 9);

    y += stepH + 3;
  }

  return y + 6;
}

// ─── Conservation ─────────────────────────────────────────────────────────────

function addConservation(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const s = payload.sheet;
  const fields: [string, string | null | undefined][] = [
    ['Temperatura', s?.temperaturaConservacion],
    ['Caducidad', s?.vidaUtil],
    ['Envasado', s?.tipoConservacion],
    ['Regeneración', s?.regeneracion],
  ];
  const active = fields.filter(([, v]) => v?.trim());
  if (active.length === 0) return y;

  y = needsNewPage(doc, y, 38, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, 'Conservación');
  y += 15;

  const colW = CW / active.length;
  active.forEach(([label, value], i) => {
    const x = MX + i * colW;
    if (i > 0) rule(doc, y + 10, x - 5, x - 5, FAINT, 0.25);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(safe(value), x, y + 13, { maxWidth: colW - 6 });
  });

  return y + 24;
}

// ─── Allergens (compact text format) ─────────────────────────────────────────

function addAllergens(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const active = payload.recipeAllergens.filter((a) => a.status !== 'excluded');
  if (active.length === 0) return y;

  const contains = active.filter((a) => a.presence_type === 'contains');
  const traces   = active.filter((a) => a.presence_type !== 'contains');

  y = needsNewPage(doc, y, 36, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, 'Alérgenos');
  y += 15;

  const allergenName = (a: RecipeAllergenRow) => safe(a.allergen?.name ?? a.allergen_id, '?');

  if (contains.length > 0 && traces.length > 0) {
    // Two lines: Contiene / Trazas
    const cLine = contains.map(allergenName).join(' · ');
    const tLine = traces.map(allergenName).join(' · ');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...TERRA);
    const cLabelW = doc.getTextWidth('Contiene: ') as number;
    doc.text('Contiene: ', MX, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
    doc.text(cLine, MX + cLabelW, y, { maxWidth: CW - cLabelW });
    y += 11;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const tLabelW = doc.getTextWidth('Trazas: ') as number;
    doc.text('Trazas: ', MX, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(tLine, MX + tLabelW, y, { maxWidth: CW - tLabelW });
    y += 11;
  } else {
    // Single line
    const all = active.map(allergenName).join(' · ');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    doc.text(all, MX, y, { maxWidth: CW });
    y += 12;
  }

  return y + 4;
}

// ─── Observations ─────────────────────────────────────────────────────────────

function addObservations(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const text = safe(payload.sheet?.notasChef, '');
  if (!text) return y;

  y = needsNewPage(doc, y, 36, logo, payload.recipe.name);
  sectionTitle(doc, MX, y + 7, 'Observaciones');
  y += 15;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
  const lines = (doc.splitTextToSize(text, CW) as string[]).slice(0, 5);
  doc.text(lines, MX, y);

  return y + lines.length * 9.5 + 8;
}

// ─── Section divider ──────────────────────────────────────────────────────────

function divider(doc: jsPDF, y: number): number {
  rule(doc, y + 4, MX, PW - MX, FAINT, 0.25);
  return y + 12;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printRecipePDF(payload: RecipePrintPayload): Promise<void> {
  const [logo, photo, qrDataUrl] = await Promise.all([
    loadLogo(),
    loadPhoto(getOfficialRecipePhotoUrl(payload.sheet)),
    (async () => {
      if (typeof window === 'undefined') return null;
      const url = `${window.location.origin}/escandallos/recetas/${payload.recipe.id}/editar`;
      return QRCode.toDataURL(url, { margin: 1, width: 160 });
    })(),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const vals = productionValues(payload);

  let y = buildHero(doc, payload, logo, photo);
  y = divider(doc, y);
  y = addIngredients(doc, payload, y, logo);
  y = divider(doc, y);
  y = addProduction(doc, payload, vals, y, logo);
  y = divider(doc, y);
  y = addSteps(doc, payload, y, logo);
  y = divider(doc, y);
  y = addConservation(doc, payload, y, logo);
  y = divider(doc, y);
  y = addAllergens(doc, payload, y, logo);
  y = divider(doc, y);
  addObservations(doc, payload, y, logo);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, qrDataUrl);
  }

  const blobUrl = doc.output('bloburl');
  if (typeof window !== 'undefined') {
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  doc.save(`chef-one-${safeFileName(payload.recipe.name)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
