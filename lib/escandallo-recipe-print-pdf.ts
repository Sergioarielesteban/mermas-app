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
type PhotoAsset = { dataUrl: string; aspect: number }; // aspect = height/width

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

// ─── Layout constants (pt, A4 portrait) ──────────────────────────────────────

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MM = 2.8346456693;
const MX = Math.round(14 * MM);   // margin x ~39.7pt
const MT = Math.round(13 * MM);   // margin top
const MB = Math.round(12 * MM);   // margin bottom
const CW = PAGE_W - MX * 2;       // content width ~515pt
const SAFE_BOTTOM = PAGE_H - MB - 16; // y threshold before page break

// ─── Colour palette ───────────────────────────────────────────────────────────

const WHITE: RGB  = [255, 255, 255];
const INK: RGB    = [15, 12, 10];
const MUTED: RGB  = [130, 120, 108];
const BORDER: RGB = [218, 210, 198];
const CREAM: RGB  = [247, 243, 238];
const TERRA: RGB  = [196, 83, 31];
const OLIVE: RGB  = [74, 107, 58];
const GOLD: RGB   = [184, 135, 42];
const PALE_T: RGB = [253, 244, 241];
const PALE_O: RGB = [246, 250, 244];
const PALE_G: RGB = [254, 252, 246];

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmtQty(v: number | null | undefined, max = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-ES', { maximumFractionDigits: max });
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}
function safe(v: string | null | undefined, fb = '—'): string {
  const s = String(v ?? '').trim();
  return s || fb;
}
function safeFileName(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'receta';
}
function formatDate(): string {
  return new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function clamp(v: number, min: number, max: number): number { return Math.min(max, Math.max(min, v)); }

// ─── Recipe kind ─────────────────────────────────────────────────────────────

function recipeKind(recipe: EscandalloRecipe, sheet: EscandalloTechnicalSheet | null): 'PLATO' | 'BASE' | 'ELABORACIÓN' {
  if (!recipe.isSubRecipe) return 'PLATO';
  const cat = `${sheet?.categoria ?? ''}`.toLowerCase();
  if (cat.includes('elabor')) return 'ELABORACIÓN';
  return 'BASE';
}
function kindColor(kind: 'PLATO' | 'BASE' | 'ELABORACIÓN'): RGB {
  if (kind === 'PLATO') return TERRA;
  if (kind === 'BASE') return OLIVE;
  return GOLD;
}

// ─── Cost helpers (unchanged logic) ──────────────────────────────────────────

function lineCost(line: EscandalloLine, payload: RecipePrintPayload): number {
  const unit = lineUnitPriceEur(line, payload.rawById, payload.processedById, {
    linesByRecipe: payload.linesByRecipe,
    recipesById: payload.recipesById,
    technicalSheetsByRecipe: payload.technicalSheetsByRecipe,
    centralKitchenById: payload.centralKitchenById,
    expanding: new Set([payload.recipe.id]),
  });
  return Math.round(line.qty * unit * 10000) / 10000;
}

function productionValues(payload: RecipePrintPayload) {
  const { recipe, sheet, productionTotalCost, rawById, lines } = payload;
  const kind = recipeKind(recipe, sheet);
  const outputQty =
    sheet?.yieldQuantity != null && Number.isFinite(sheet.yieldQuantity) && sheet.yieldQuantity > 0
      ? sheet.yieldQuantity
      : recipe.finalWeightQty != null && recipe.finalWeightQty > 0
        ? recipe.finalWeightQty
        : recipe.yieldQty > 0 ? recipe.yieldQty : null;
  const outputUnit = sheet?.yieldUnit ?? recipe.finalWeightUnit ?? recipe.yieldLabel ?? 'ración';
  const costPerYield = sheet?.yieldCostPerUnit != null && Number.isFinite(sheet.yieldCostPerUnit)
    ? sheet.yieldCostPerUnit
    : computeYieldCostPerUnit(productionTotalCost, outputQty);
  const inputWeight = totalInputWeightKg(lines, rawById);
  const inputKg = inputWeight.kg > 0 ? inputWeight.kg : null;
  const mermaPct = sheet?.yieldMermaPct != null && Number.isFinite(sheet.yieldMermaPct)
    ? sheet.yieldMermaPct
    : inputKg != null && outputQty != null ? computeMermaPct(inputKg, 'kg', outputQty, outputUnit) : null;
  const operationalCost = sheet?.operationalCost != null && Number.isFinite(sheet.operationalCost)
    ? sheet.operationalCost
    : computeOperationalCost(costPerYield, outputUnit, sheet?.operationalQuantity, sheet?.operationalUnit);
  const netSale = !recipe.isSubRecipe && recipe.salePriceGrossEur != null && recipe.salePriceGrossEur > 0
    ? saleNetPerUnitFromGross(recipe.salePriceGrossEur, recipe.saleVatRatePct ?? 10)
    : null;
  const foodCost = !recipe.isSubRecipe ? foodCostPercentOfNetSale(productionTotalCost, recipe.yieldQty || 1, netSale) : null;
  const margin = foodCost != null ? Math.round((100 - foodCost) * 10) / 10 : null;
  return { kind, costPerYield, foodCost, margin, operationalCost, inputKg, outputQty, outputUnit, mermaPct,
    pvpGross: !recipe.isSubRecipe && recipe.salePriceGrossEur && recipe.salePriceGrossEur > 0 ? recipe.salePriceGrossEur : null };
}

function lineSourceLabel(line: EscandalloLine): string {
  if (line.sourceType === 'subrecipe') return 'BASE';
  if (line.sourceType === 'processed') return 'ELAB.';
  if (line.sourceType === 'central_kitchen') return 'C.CENTRAL';
  if (line.sourceType === 'manual') return 'MANUAL';
  return '';
}

// ─── Asset loaders ────────────────────────────────────────────────────────────

const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let _logoPromise: Promise<LogoAsset | null> | null = null;

async function loadOfficialChefLogo(): Promise<LogoAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (_logoPromise) return _logoPromise;
  _logoPromise = (async () => {
    try {
      const res = await fetch(OFFICIAL_CHEF_LOGO_SRC);
      if (!res.ok) return null;
      const svg = (await res.text()).replace(/<rect\b[^>]*fill="#ffffff"[^>]*\/>/gi, '');
      const img = new Image();
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const loaded = await new Promise<HTMLImageElement | null>((ok) => {
        img.onload = () => ok(img); img.onerror = () => ok(null); img.src = src;
      });
      if (!loaded || loaded.naturalWidth <= 0) return null;
      const c = document.createElement('canvas');
      c.width = 538; c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      const sx = (53 / 375) * loaded.naturalWidth, sy = (154 / 375) * loaded.naturalHeight;
      const sw = (269 / 375) * loaded.naturalWidth, sh = (64 / 375) * loaded.naturalHeight;
      ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return { dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height };
    } catch { return null; }
  })();
  return _logoPromise;
}

async function loadPhotoAsset(src: string | null | undefined): Promise<PhotoAsset | null> {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    const norm = src.trim();
    if (!norm.startsWith('data:') && !norm.startsWith('blob:') && !norm.startsWith('/')) img.crossOrigin = 'anonymous';
    const loaded = await new Promise<HTMLImageElement | null>((ok) => {
      img.onload = () => ok(img); img.onerror = () => ok(null); img.src = norm;
    });
    if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;
    const aspect = loaded.naturalHeight / loaded.naturalWidth;
    const c = document.createElement('canvas');
    const maxW = 900;
    c.width = maxW; c.height = Math.round(aspect * maxW);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(loaded, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.9), aspect };
  } catch { return null; }
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function hLine(doc: jsPDF, y: number, x0 = MX, x1 = PAGE_W - MX, color: RGB = BORDER, lw = 0.4): void {
  doc.setDrawColor(...color); doc.setLineWidth(lw); doc.line(x0, y, x1, y);
}

function sectionLabel(doc: jsPDF, x: number, y: number, text: string, lineW?: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TERRA);
  doc.text(text.toUpperCase(), x, y);
  const labelW = doc.getTextWidth(text.toUpperCase());
  const endX = lineW != null ? x + lineW : PAGE_W - MX;
  if (endX > x + labelW + 8) {
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.35);
    doc.line(x + labelW + 6, y - 1.5, endX, y - 1.5);
  }
}

function drawContainedImage(doc: jsPDF, asset: PhotoAsset, boxX: number, boxY: number, boxW: number, boxH: number): void {
  const imgW = asset.aspect <= boxH / boxW ? boxW : boxH / asset.aspect;
  const imgH = imgW * asset.aspect;
  const offX = (boxW - imgW) / 2;
  const offY = (boxH - imgH) / 2;
  doc.addImage(asset.dataUrl, 'JPEG', boxX + offX, boxY + offY, imgW, imgH);
}

function fcTone(fc: number | null): RGB {
  if (fc == null) return INK;
  if (fc <= 30) return OLIVE;
  if (fc <= 35) return GOLD;
  return TERRA;
}
function marginTone(m: number | null): RGB {
  if (m == null) return INK;
  if (m >= 65) return OLIVE;
  if (m >= 55) return GOLD;
  return TERRA;
}

// ─── Page chrome ─────────────────────────────────────────────────────────────

function addPageBackground(doc: jsPDF): void {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function drawPageFooter(doc: jsPDF, page: number, total: number): void {
  const y = PAGE_H - 9;
  hLine(doc, y - 6, MX, PAGE_W - MX, BORDER, 0.3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...MUTED);
  doc.text(`Impreso: ${formatDate()}`, MX, y);
  doc.text(`Página ${page} / ${total}`, PAGE_W - MX, y, { align: 'right' });
}

function drawMiniHeader(doc: jsPDF, logo: LogoAsset | null, recipeName: string): void {
  addPageBackground(doc);
  // Compact logo
  if (logo) {
    const lw = 72; const lh = (lw * logo.height) / logo.width;
    doc.addImage(logo.dataUrl, 'PNG', MX, 10, lw, lh);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TERRA);
    doc.text('Chef One', MX, 22);
  }
  doc.setFont('times', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
  const nameX = logo ? MX + 78 : MX + 62;
  doc.text(safe(recipeName), nameX, 22, { maxWidth: CW - 80 });
  hLine(doc, 30, MX, PAGE_W - MX, BORDER, 0.4);
}

function needsNewPage(doc: jsPDF, y: number, needed: number, logo: LogoAsset | null, recipeName: string): number {
  if (y + needed <= SAFE_BOTTOM) return y;
  doc.addPage();
  drawMiniHeader(doc, logo, recipeName);
  return MT + 18;
}

// ─── Page 1: Header zone ─────────────────────────────────────────────────────

function buildPage1Header(doc: jsPDF, payload: RecipePrintPayload, logo: LogoAsset | null, photo: PhotoAsset | null): { y: number } {
  addPageBackground(doc);
  const { recipe, sheet } = payload;
  const kind = recipeKind(recipe, sheet);
  const kColor = kindColor(kind);
  const family = safe(sheet?.categoria, '');
  const isActive = sheet?.activa !== false;

  // ── Logo + local name ──────────────────────────────────────────────────────
  const LOGO_W = 110;
  const LOGO_H = logo ? (LOGO_W * logo.height) / logo.width : 28;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MX, 12, LOGO_W, LOGO_H);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...TERRA);
    doc.text('Chef One', MX, 26);
  }
  // Local name right
  if (payload.localName?.trim()) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
    doc.text(safe(payload.localName), PAGE_W - MX, 24, { align: 'right' });
  }

  // Rule under logo
  const ruleY = Math.max(LOGO_H + 16, 44);
  hLine(doc, ruleY, MX, PAGE_W - MX, BORDER, 0.5);

  // ── Type badge ─────────────────────────────────────────────────────────────
  let y = ruleY + 12;
  const badgeW = doc.getTextWidth(kind) + 20;
  doc.setFillColor(...kColor);
  doc.roundedRect(MX, y, badgeW, 13, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...WHITE);
  doc.text(kind, MX + badgeW / 2, y + 9, { align: 'center' });

  // Status badge
  const statusLabel = isActive ? 'ACTIVA' : 'INACTIVA';
  const sBg: RGB = isActive ? PALE_O : PALE_T;
  const sFg: RGB = isActive ? OLIVE : TERRA;
  const statusX = MX + badgeW + 6;
  const statusW = doc.getTextWidth(statusLabel) + 16;
  doc.setFillColor(...sBg); doc.setDrawColor(...sFg); doc.setLineWidth(0.5);
  doc.roundedRect(statusX, y, statusW, 13, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...sFg);
  doc.text(statusLabel, statusX + statusW / 2, y + 9, { align: 'center' });

  // Date right
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...MUTED);
  doc.text(`Actualizado: ${formatDate()}`, PAGE_W - MX, y + 9, { align: 'right' });

  // ── Recipe name ────────────────────────────────────────────────────────────
  y += 20;
  const photoZoneW = photo ? Math.round(CW * 0.52) : 0;
  const nameMaxW = photoZoneW > 0 ? CW - photoZoneW - 16 : CW;

  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  const nameLines = doc.splitTextToSize(safe(recipe.name, 'Sin nombre'), nameMaxW) as string[];
  const shownNameLines = nameLines.slice(0, 2);
  doc.text(shownNameLines, MX, y + 22);
  const nameBlockH = shownNameLines.length * 24;

  // Family below name
  y += nameBlockH + 4;
  if (family) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(family, MX, y);
    y += 10;
  }

  // Notes/description (short, max 2 lines)
  const notesSrc = safe(sheet?.notasChef ?? recipe.notes, '');
  if (notesSrc) {
    const notesLines = (doc.splitTextToSize(notesSrc, nameMaxW) as string[]).slice(0, 2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(notesLines, MX, y);
    y += notesLines.length * 10 + 2;
  }

  // Yield info below name
  const yieldStr = `${fmtQty(recipe.yieldQty)} ${safe(recipe.yieldLabel, 'ración')}`;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text(yieldStr, MX, y);

  // ── Photo (hero, right column) ─────────────────────────────────────────────
  const heroTopY = ruleY + 14;
  if (photo && photoZoneW > 0) {
    const maxH = 164;
    const pW = photoZoneW;
    const pH = Math.min(maxH, pW * photo.aspect);
    const pX = PAGE_W - MX - pW;
    const pY = heroTopY;

    // Container card
    doc.setFillColor(...CREAM); doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
    doc.roundedRect(pX, pY, pW, pH + 6, 6, 6, 'FD');
    drawContainedImage(doc, photo, pX + 3, pY + 3, pW - 6, pH);

    y = Math.max(y + 14, pY + pH + 14);
  } else {
    y += 14;
  }

  return { y };
}

// ─── KPI cards ────────────────────────────────────────────────────────────────

function addKpiCards(doc: jsPDF, vals: ReturnType<typeof productionValues>, y: number): number {
  type Card = { label: string; value: string; sub?: string; tone: RGB };
  const cards: Card[] = [];

  if (vals.costPerYield != null) {
    cards.push({ label: 'Coste / ración', value: formatMoneyEur(vals.costPerYield), sub: vals.outputUnit, tone: INK });
  }
  if (vals.pvpGross != null) {
    cards.push({ label: 'PVP', value: formatMoneyEur(vals.pvpGross), tone: INK });
  }
  if (vals.foodCost != null) {
    cards.push({ label: 'Food cost', value: fmtPct(vals.foodCost), tone: fcTone(vals.foodCost) });
  }
  if (vals.margin != null) {
    cards.push({ label: 'Margen bruto', value: fmtPct(vals.margin), tone: marginTone(vals.margin) });
  }
  if (cards.length === 0) return y;

  const gap = 8;
  const cardH = 48;
  const cardW = (CW - gap * (cards.length - 1)) / cards.length;

  cards.forEach((card, i) => {
    const cx = MX + i * (cardW + gap);
    doc.setFillColor(...WHITE); doc.setDrawColor(...BORDER); doc.setLineWidth(0.5);
    doc.roundedRect(cx, y, cardW, cardH, 6, 6, 'FD');

    // Label
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...TERRA);
    doc.text(card.label.toUpperCase(), cx + 10, y + 13);

    // Value
    doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(...card.tone);
    doc.text(card.value, cx + 10, y + 32);

    // Sub
    if (card.sub) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
      doc.text(card.sub, cx + 10, y + 42);
    }
  });

  return y + cardH + 10;
}

// ─── Production block (only if data exists) ───────────────────────────────────

function addProductionBlock(doc: jsPDF, payload: RecipePrintPayload, vals: ReturnType<typeof productionValues>, y: number, logo: LogoAsset | null): number {
  const rows: [string, string][] = [];
  if (vals.inputKg != null) rows.push(['Entrada total', `${fmtQty(vals.inputKg, 3)} kg`]);
  if (vals.outputQty != null) rows.push(['Salida', `${fmtQty(vals.outputQty)} ${vals.outputUnit}`]);
  if (vals.mermaPct != null) rows.push(['Merma', fmtPct(vals.mermaPct)]);
  if (vals.operationalCost != null) rows.push(['Coste operativo', formatMoneyEur(vals.operationalCost)]);
  if (rows.length === 0) return y;

  const h = 28 + Math.ceil(rows.length / 3) * 26 + 8;
  y = needsNewPage(doc, y, h, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, 'Producción');
  y += 16;

  const colW = CW / 3;
  rows.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MX + col * colW;
    const ry = y + row * 26;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...MUTED);
    doc.text(label, x, ry);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK);
    doc.text(value, x, ry + 12);
  });

  y += Math.ceil(rows.length / 3) * 26 + 6;
  hLine(doc, y, MX, PAGE_W - MX, BORDER, 0.3);
  return y + 8;
}

// ─── Ingredients (premium list) ───────────────────────────────────────────────

function addIngredients(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  if (payload.lines.length === 0) return y;

  y = needsNewPage(doc, y, 60, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, `Ingredientes  (${payload.lines.length})`);
  y += 18;

  const QTY_COL = 48; // fixed width for qty+unit
  const COST_COL = 58; // fixed width for cost
  const NAME_COL = CW - QTY_COL - COST_COL;
  const ROW_H = 13;

  payload.lines.forEach((line, idx) => {
    y = needsNewPage(doc, y, ROW_H + 2, logo, payload.recipe.name);

    const even = idx % 2 === 0;
    if (even) {
      doc.setFillColor(...CREAM);
      doc.rect(MX, y - 2, CW, ROW_H, 'F');
    }

    // Qty + unit (left, fixed column, right-aligned within col)
    const qtyStr = `${fmtQty(line.qty, 3)} ${String(line.unit)}`;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(qtyStr, MX + QTY_COL - 4, y + 7, { align: 'right' });

    // Name + source badge
    const badge = lineSourceLabel(line);
    const parsedName = (() => {
      const sep = line.label.indexOf(' · ');
      return sep > 0 ? line.label.slice(sep + 3) : line.label;
    })();
    const displayName = badge ? `${parsedName}  [${badge}]` : parsedName;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    const nameX = MX + QTY_COL + 4;
    const nameMaxW = NAME_COL - 8;
    const truncated = doc.splitTextToSize(displayName, nameMaxW) as string[];
    doc.text(truncated[0] ?? '', nameX, y + 7.5);

    // Dots between name and cost
    const nameRendered = truncated[0] ?? '';
    const nameEndX = nameX + (doc.getTextWidth(nameRendered) as number);
    const costText = formatMoneyEur(lineCost(line, payload));
    const costX = MX + CW;
    const costStartX = costX - (doc.getTextWidth(costText) as number);
    const dotsStart = nameEndX + 4;
    const dotsEnd = costStartX - 4;
    if (dotsEnd > dotsStart + 6) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...BORDER);
      const dotUnit = '. ';
      const dotW = doc.getTextWidth(dotUnit) as number;
      const dotsCount = Math.floor((dotsEnd - dotsStart) / dotW);
      if (dotsCount > 0) doc.text(dotUnit.repeat(dotsCount), dotsStart, y + 7, { charSpace: 0 });
    }

    // Cost (right)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...INK);
    doc.text(costText, costX, y + 7.5, { align: 'right' });

    y += ROW_H;
  });

  y += 4;

  // Total row
  y = needsNewPage(doc, y, 24, logo, payload.recipe.name);
  doc.setFillColor(...PALE_T); doc.setDrawColor(230, 200, 190); doc.setLineWidth(0.4);
  doc.roundedRect(MX, y, CW, 22, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...TERRA);
  doc.text('COSTE TOTAL PRODUCCIÓN', MX + 10, y + 14);
  doc.setFont('times', 'bold'); doc.setFontSize(14); doc.setTextColor(...TERRA);
  doc.text(formatMoneyEur(payload.productionTotalCost), MX + CW - 10, y + 15, { align: 'right' });

  return y + 28;
}

// ─── Steps / elaboración ──────────────────────────────────────────────────────

function addSteps(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  if (payload.steps.length === 0) return y;

  y = needsNewPage(doc, y, 50, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, 'Elaboración');
  y += 20;

  const CIRCLE_R = 9;
  const TEXT_X = MX + CIRCLE_R * 2 + 10;
  const TEXT_W = CW - CIRCLE_R * 2 - 14;
  const STEP_MIN_H = 24;

  for (const [idx, step] of payload.steps.entries()) {
    const text = safe(`${step.titulo ? `${step.titulo}: ` : ''}${step.descripcion}`, '—');
    const lines = doc.splitTextToSize(text, TEXT_W) as string[];
    const stepH = Math.max(STEP_MIN_H, lines.length * 9.5 + 8);

    y = needsNewPage(doc, y, stepH + 6, logo, payload.recipe.name);

    // Circle number
    const circleY = y + CIRCLE_R + 2;
    doc.setFillColor(...TERRA);
    doc.circle(MX + CIRCLE_R, circleY, CIRCLE_R, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(idx + 1 >= 10 ? 7 : 8);
    doc.setTextColor(...WHITE);
    doc.text(String(idx + 1), MX + CIRCLE_R, circleY + 3, { align: 'center' });

    // Step text
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK);
    doc.text(lines, TEXT_X, y + 10);

    y += stepH + 4;
  }

  return y + 6;
}

// ─── Conservation ─────────────────────────────────────────────────────────────

function addConservation(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const sheet = payload.sheet;
  const fields: [string, string | null | undefined][] = [
    ['Temperatura', sheet?.temperaturaConservacion],
    ['Caducidad', sheet?.vidaUtil],
    ['Envasado', sheet?.tipoConservacion],
    ['Regeneración', sheet?.regeneracion],
  ];
  const active = fields.filter(([, v]) => v?.trim());
  if (active.length === 0) return y;

  y = needsNewPage(doc, y, 60, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, 'Conservación');
  y += 18;

  const colW = CW / Math.min(active.length, 4);
  active.slice(0, 4).forEach(([label, value], i) => {
    const x = MX + i * colW;
    if (i > 0) hLine(doc, y + 14, x - 6, x - 6, BORDER, 0.3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(safe(value), x, y + 14, { maxWidth: colW - 8 });
  });

  return y + 28;
}

// ─── Allergens ────────────────────────────────────────────────────────────────

function addAllergens(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const active = payload.recipeAllergens.filter((a) => a.status !== 'excluded');
  if (active.length === 0) return y;

  y = needsNewPage(doc, y, 50, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, 'Alérgenos');
  y += 18;

  const CHIP_W = 94;
  const CHIP_H = 18;
  const CHIP_GAP_X = 6;
  const CHIP_GAP_Y = 5;
  const COLS = Math.floor(CW / (CHIP_W + CHIP_GAP_X));

  active.forEach((row, i) => {
    const col = i % COLS;
    const r = Math.floor(i / COLS);
    const cx = MX + col * (CHIP_W + CHIP_GAP_X);
    const cy = y + r * (CHIP_H + CHIP_GAP_Y);

    y = needsNewPage(doc, cy + CHIP_H + CHIP_GAP_Y, 0, logo, payload.recipe.name);

    const isContains = row.presence_type === 'contains';
    const bg: RGB = isContains ? PALE_T : PALE_G;
    const fg: RGB = isContains ? TERRA : GOLD;
    doc.setFillColor(...bg); doc.setDrawColor(...fg); doc.setLineWidth(0.5);
    doc.roundedRect(cx, cy, CHIP_W, CHIP_H, 5, 5, 'FD');

    const allergenName = safe(row.allergen?.name ?? row.allergen_id, '').slice(0, 16);
    const typeTag = isContains ? 'Contiene' : 'Trazas';

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...fg);
    doc.text(allergenName, cx + CHIP_W / 2, cy + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(...fg);
    doc.text(typeTag, cx + CHIP_W / 2, cy + 14, { align: 'center' });
  });

  const totalRows = Math.ceil(active.length / COLS);
  return y + totalRows * (CHIP_H + CHIP_GAP_Y) + 6;
}

// ─── Observations ─────────────────────────────────────────────────────────────

function addObservations(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null): number {
  const text = safe(payload.sheet?.notasChef ?? '', '');
  if (!text) return y;

  y = needsNewPage(doc, y, 50, logo, payload.recipe.name);
  sectionLabel(doc, MX, y + 8, 'Observaciones');
  y += 18;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...INK);
  const lines = (doc.splitTextToSize(text, CW) as string[]).slice(0, 6);
  doc.text(lines, MX, y);

  return y + lines.length * 10 + 8;
}

// ─── QR footer block ──────────────────────────────────────────────────────────

function addQrBlock(doc: jsPDF, payload: RecipePrintPayload, y: number, qrDataUrl: string | null, logo: LogoAsset | null): number {
  if (!qrDataUrl) return y;
  y = needsNewPage(doc, y, 54, logo, payload.recipe.name);

  const QR_SIZE = 46;
  const qx = PAGE_W - MX - QR_SIZE;

  doc.setFillColor(...CREAM); doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.roundedRect(qx - 4, y, QR_SIZE + 8, QR_SIZE + 8, 5, 5, 'FD');
  doc.addImage(qrDataUrl, 'PNG', qx, y + 4, QR_SIZE, QR_SIZE);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
  doc.text('Accede a la receta', qx - 10, y + 10, { align: 'right' });
  doc.text('en Chef One', qx - 10, y + 18, { align: 'right' });

  return y + QR_SIZE + 16;
}

// ─── Separator helper ─────────────────────────────────────────────────────────

function addSeparator(doc: jsPDF, y: number): number {
  hLine(doc, y + 4, MX, PAGE_W - MX, BORDER, 0.3);
  return y + 12;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printRecipePDF(payload: RecipePrintPayload): Promise<void> {
  const [logo, photo, qrDataUrl] = await Promise.all([
    loadOfficialChefLogo(),
    loadPhotoAsset(getOfficialRecipePhotoUrl(payload.sheet)),
    (async () => {
      const url = typeof window !== 'undefined'
        ? `${window.location.origin}/escandallos/recetas/${payload.recipe.id}/editar`
        : '';
      return url ? QRCode.toDataURL(url, { margin: 1, width: 180 }) : null;
    })(),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const vals = productionValues(payload);

  // ── Page 1 ──────────────────────────────────────────────────────────────────
  const { y: afterHeader } = buildPage1Header(doc, payload, logo, photo);
  let y = afterHeader;

  y = addSeparator(doc, y);
  y = addKpiCards(doc, vals, y);
  y = addSeparator(doc, y);
  y = addIngredients(doc, payload, y, logo);
  y = addSeparator(doc, y);
  y = addProductionBlock(doc, payload, vals, y, logo);
  if (payload.steps.length > 0) y = addSeparator(doc, y);
  y = addSteps(doc, payload, y, logo);
  if (payload.sheet) {
    y = addSeparator(doc, clamp(y, 0, SAFE_BOTTOM - 50));
    y = addConservation(doc, payload, y, logo);
  }
  if (payload.recipeAllergens.filter((a) => a.status !== 'excluded').length > 0) {
    y = addSeparator(doc, y);
    y = addAllergens(doc, payload, y, logo);
  }
  if (payload.sheet?.notasChef?.trim()) {
    y = addSeparator(doc, y);
    y = addObservations(doc, payload, y, logo);
  }
  addQrBlock(doc, payload, y, qrDataUrl, logo);

  // ── Footers on all pages ───────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawPageFooter(doc, p, total);
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  const blobUrl = doc.output('bloburl');
  if (typeof window !== 'undefined') {
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  doc.save(`chef-one-${safeFileName(payload.recipe.name)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
