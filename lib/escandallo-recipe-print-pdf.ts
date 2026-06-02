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

type RGB = [number, number, number];
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

// A4 portrait in points.
const PW = 595.28;
const PH = 841.89;
const M = 22;
const CW = PW - M * 2;
const FOOTER_TOP = 784;
const SAFE_B = FOOTER_TOP - 12;

const WHITE: RGB = [255, 255, 255];
const PAPER: RGB = [252, 251, 249];
const NAVY: RGB = [13, 24, 44];
const MUTED: RGB = [96, 104, 116];
const BORDER: RGB = [224, 224, 220];
const DIVIDER: RGB = [207, 210, 214];
const ORANGE: RGB = [239, 111, 0];
const ORANGE_SOFT: RGB = [255, 247, 239];
const GREEN: RGB = [31, 160, 95];
const RED: RGB = [229, 57, 53];
const BLUE: RGB = [33, 150, 243];
const PURPLE: RGB = [132, 60, 171];
const GRAY: RGB = [132, 140, 150];
const AMBER: RGB = [245, 158, 11];

type RecipeKind = 'PLATO' | 'BASE' | 'ELABORACIÓN';
type IconName =
  | 'allergen'
  | 'basket'
  | 'bowl'
  | 'calendar'
  | 'chart'
  | 'chef'
  | 'clipboard'
  | 'coins'
  | 'comment'
  | 'gear'
  | 'percent'
  | 'plate'
  | 'snow'
  | 'status'
  | 'tag'
  | 'temperature'
  | 'tools'
  | 'unit'
  | 'warning';

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

function upper(v: string | null | undefined, fb = ''): string {
  return safe(v, fb).toLocaleUpperCase('es-ES');
}

function safeFileName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'receta';
}

function printDate(): string {
  return new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function printDateTime(): string {
  return new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function recipeKind(r: EscandalloRecipe, s: EscandalloTechnicalSheet | null): RecipeKind {
  if (!r.isSubRecipe) return 'PLATO';
  if (`${s?.categoria ?? ''}`.toLowerCase().includes('elabor')) return 'ELABORACIÓN';
  return 'BASE';
}

function kindColor(k: RecipeKind): RGB {
  return k === 'PLATO' ? ORANGE : k === 'BASE' ? GREEN : AMBER;
}

function unitSingular(unit: string | null | undefined): string {
  const u = safe(unit, 'ración').toLowerCase();
  if (u === 'raciones') return 'ración';
  return u;
}

function unitPlural(unit: string | null | undefined): string {
  const u = unitSingular(unit);
  if (u === 'ración') return 'raciones';
  if (u === 'ud') return 'uds';
  return u;
}

function truncateToWidth(doc: jsPDF, text: string, maxW: number): string {
  const clean = safe(text, '—');
  if ((doc.getTextWidth(clean) as number) <= maxW) return clean;
  let out = clean;
  while (out.length > 1 && (doc.getTextWidth(`${out}…`) as number) > maxW) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

function splitLines(doc: jsPDF, text: string, maxW: number, maxLines: number): string[] {
  const lines = doc.splitTextToSize(safe(text, '—'), maxW) as string[];
  return lines.slice(0, maxLines);
}

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
    sheet?.yieldQuantity != null && sheet.yieldQuantity > 0
      ? sheet.yieldQuantity
      : recipe.finalWeightQty != null && recipe.finalWeightQty > 0
        ? recipe.finalWeightQty
        : recipe.yieldQty > 0
          ? recipe.yieldQty
          : null;
  const outputUnit = sheet?.yieldUnit ?? recipe.finalWeightUnit ?? recipe.yieldLabel ?? 'ración';
  const costPerYield =
    sheet?.yieldCostPerUnit != null && Number.isFinite(sheet.yieldCostPerUnit)
      ? sheet.yieldCostPerUnit
      : computeYieldCostPerUnit(productionTotalCost, outputQty);
  const inputKg = (() => {
    const w = totalInputWeightKg(lines, rawById);
    return w.kg > 0 ? w.kg : null;
  })();
  const mermaPct =
    sheet?.yieldMermaPct != null && Number.isFinite(sheet.yieldMermaPct)
      ? sheet.yieldMermaPct
      : inputKg != null && outputQty != null
        ? computeMermaPct(inputKg, 'kg', outputQty, outputUnit)
        : null;
  const operationalCost =
    sheet?.operationalCost != null && Number.isFinite(sheet.operationalCost)
      ? sheet.operationalCost
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
    kind,
    outputQty,
    outputUnit,
    costPerYield,
    operationalCost,
    inputKg,
    mermaPct,
    foodCost,
    margin,
    pvpGross: !recipe.isSubRecipe && recipe.salePriceGrossEur && recipe.salePriceGrossEur > 0
      ? recipe.salePriceGrossEur
      : null,
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
  if (v == null) return NAVY;
  return v <= 30 ? GREEN : v <= 35 ? AMBER : RED;
}

function marginTone(v: number | null): RGB {
  if (v == null) return NAVY;
  return v >= 65 ? GREEN : v >= 55 ? AMBER : RED;
}

async function loadPhoto(src: string | null | undefined, targetAspect: number): Promise<PhotoAsset | null> {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    const norm = src.trim();
    if (!norm.startsWith('data:') && !norm.startsWith('blob:') && !norm.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    const loaded = await new Promise<HTMLImageElement | null>((ok) => {
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = norm;
    });
    if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;

    const canvasW = 1200;
    const canvasH = Math.round(canvasW * targetAspect);
    const scale = Math.max(canvasW / loaded.naturalWidth, canvasH / loaded.naturalHeight);
    const drawW = loaded.naturalWidth * scale;
    const drawH = loaded.naturalHeight * scale;
    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(loaded, (canvasW - drawW) / 2, (canvasH - drawH) / 2, drawW, drawH);
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), aspect: canvasH / canvasW };
  } catch {
    return null;
  }
}

function rule(doc: jsPDF, y: number, x0 = M, x1 = PW - M, color: RGB = DIVIDER, lw = 0.45): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x0, y, x1, y);
}

function vRule(doc: jsPDF, x: number, y0: number, y1: number, color: RGB = DIVIDER, lw = 0.45): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x, y0, x, y1);
}

function card(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB = WHITE): void {
  doc.setFillColor(...fill);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.55);
  doc.roundedRect(x, y, w, h, 5, 5, 'FD');
}

function labelText(doc: jsPDF, text: string, x: number, y: number, color: RGB = MUTED): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(...color);
  doc.text(upper(text), x, y);
}

function drawIcon(doc: jsPDF, name: IconName, cx: number, cy: number, color: RGB = NAVY, size = 14): void {
  const s = size;
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(1.1);
  switch (name) {
    case 'chef':
      doc.circle(cx - s * 0.25, cy - s * 0.18, s * 0.25, 'S');
      doc.circle(cx, cy - s * 0.28, s * 0.3, 'S');
      doc.circle(cx + s * 0.28, cy - s * 0.16, s * 0.25, 'S');
      doc.roundedRect(cx - s * 0.45, cy - s * 0.03, s * 0.9, s * 0.42, 2, 2, 'S');
      break;
    case 'tag':
      doc.line(cx - s * 0.46, cy - s * 0.18, cx - s * 0.06, cy - s * 0.52);
      doc.line(cx - s * 0.06, cy - s * 0.52, cx + s * 0.46, cy - s * 0.05);
      doc.line(cx + s * 0.46, cy - s * 0.05, cx + s * 0.06, cy + s * 0.47);
      doc.line(cx + s * 0.06, cy + s * 0.47, cx - s * 0.46, cy - s * 0.18);
      doc.circle(cx - s * 0.02, cy - s * 0.22, s * 0.07, 'S');
      break;
    case 'status':
      doc.circle(cx, cy, s * 0.42, 'S');
      doc.circle(cx, cy - s * 0.18, s * 0.11, 'S');
      doc.line(cx, cy - s * 0.03, cx, cy + s * 0.22);
      break;
    case 'plate':
      doc.ellipse(cx, cy + s * 0.12, s * 0.43, s * 0.18, 'S');
      doc.line(cx - s * 0.43, cy + s * 0.12, cx + s * 0.43, cy + s * 0.12);
      doc.line(cx - s * 0.34, cy + s * 0.3, cx + s * 0.34, cy + s * 0.3);
      doc.line(cx - s * 0.28, cy - s * 0.12, cx - s * 0.18, cy - s * 0.36);
      doc.line(cx + s * 0.18, cy - s * 0.12, cx + s * 0.28, cy - s * 0.36);
      break;
    case 'calendar':
      doc.roundedRect(cx - s * 0.45, cy - s * 0.35, s * 0.9, s * 0.75, 1.5, 1.5, 'S');
      doc.line(cx - s * 0.45, cy - s * 0.15, cx + s * 0.45, cy - s * 0.15);
      doc.line(cx - s * 0.22, cy - s * 0.48, cx - s * 0.22, cy - s * 0.25);
      doc.line(cx + s * 0.22, cy - s * 0.48, cx + s * 0.22, cy - s * 0.25);
      break;
    case 'coins':
      doc.ellipse(cx, cy - s * 0.25, s * 0.36, s * 0.17, 'S');
      doc.ellipse(cx, cy, s * 0.36, s * 0.17, 'S');
      doc.ellipse(cx, cy + s * 0.25, s * 0.36, s * 0.17, 'S');
      doc.line(cx - s * 0.36, cy - s * 0.25, cx - s * 0.36, cy + s * 0.25);
      doc.line(cx + s * 0.36, cy - s * 0.25, cx + s * 0.36, cy + s * 0.25);
      break;
    case 'percent':
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s * 1.15);
      doc.setTextColor(...color);
      doc.text('%', cx, cy + s * 0.34, { align: 'center' });
      break;
    case 'chart':
      doc.line(cx - s * 0.4, cy + s * 0.35, cx + s * 0.42, cy + s * 0.35);
      doc.line(cx - s * 0.4, cy + s * 0.35, cx - s * 0.4, cy - s * 0.38);
      doc.line(cx - s * 0.3, cy + s * 0.12, cx - s * 0.05, cy - s * 0.05);
      doc.line(cx - s * 0.05, cy - s * 0.05, cx + s * 0.12, cy - s * 0.22);
      doc.line(cx + s * 0.12, cy - s * 0.22, cx + s * 0.34, cy - s * 0.28);
      break;
    case 'clipboard':
      doc.roundedRect(cx - s * 0.38, cy - s * 0.35, s * 0.76, s * 0.78, 1.5, 1.5, 'S');
      doc.roundedRect(cx - s * 0.18, cy - s * 0.48, s * 0.36, s * 0.18, 1, 1, 'S');
      doc.line(cx - s * 0.22, cy - s * 0.02, cx + s * 0.2, cy - s * 0.02);
      doc.line(cx - s * 0.22, cy + s * 0.18, cx + s * 0.2, cy + s * 0.18);
      break;
    case 'basket':
      doc.line(cx - s * 0.42, cy - s * 0.08, cx + s * 0.42, cy - s * 0.08);
      doc.line(cx - s * 0.32, cy - s * 0.08, cx - s * 0.18, cy + s * 0.42);
      doc.line(cx + s * 0.32, cy - s * 0.08, cx + s * 0.18, cy + s * 0.42);
      doc.line(cx - s * 0.18, cy + s * 0.42, cx + s * 0.18, cy + s * 0.42);
      doc.line(cx - s * 0.2, cy - s * 0.08, cx, cy - s * 0.42);
      doc.line(cx + s * 0.2, cy - s * 0.08, cx, cy - s * 0.42);
      break;
    case 'gear':
      doc.circle(cx, cy, s * 0.33, 'S');
      doc.circle(cx, cy, s * 0.13, 'S');
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8;
        doc.line(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42, cx + Math.cos(a) * s * 0.52, cy + Math.sin(a) * s * 0.52);
      }
      break;
    case 'tools':
      doc.line(cx - s * 0.25, cy - s * 0.4, cx - s * 0.25, cy + s * 0.42);
      doc.line(cx - s * 0.38, cy - s * 0.24, cx - s * 0.12, cy - s * 0.24);
      doc.line(cx + s * 0.18, cy - s * 0.4, cx + s * 0.18, cy + s * 0.42);
      doc.line(cx + s * 0.08, cy - s * 0.35, cx + s * 0.28, cy - s * 0.35);
      doc.line(cx + s * 0.08, cy - s * 0.2, cx + s * 0.28, cy - s * 0.2);
      break;
    case 'unit':
      doc.ellipse(cx, cy + s * 0.04, s * 0.45, s * 0.28, 'S');
      doc.line(cx - s * 0.45, cy + s * 0.04, cx - s * 0.32, cy + s * 0.42);
      doc.line(cx + s * 0.45, cy + s * 0.04, cx + s * 0.32, cy + s * 0.42);
      doc.line(cx - s * 0.32, cy + s * 0.42, cx + s * 0.32, cy + s * 0.42);
      break;
    case 'bowl':
      doc.ellipse(cx, cy, s * 0.45, s * 0.18, 'S');
      doc.line(cx - s * 0.38, cy, cx - s * 0.22, cy + s * 0.42);
      doc.line(cx + s * 0.38, cy, cx + s * 0.22, cy + s * 0.42);
      doc.line(cx - s * 0.22, cy + s * 0.42, cx + s * 0.22, cy + s * 0.42);
      break;
    case 'temperature':
      doc.circle(cx - s * 0.1, cy + s * 0.28, s * 0.17, 'S');
      doc.roundedRect(cx - s * 0.2, cy - s * 0.45, s * 0.2, s * 0.72, 2, 2, 'S');
      doc.line(cx + s * 0.1, cy - s * 0.34, cx + s * 0.32, cy - s * 0.34);
      break;
    case 'snow':
      for (let i = 0; i < 3; i += 1) {
        const a = (Math.PI * i) / 3;
        doc.line(cx - Math.cos(a) * s * 0.48, cy - Math.sin(a) * s * 0.48, cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48);
      }
      doc.circle(cx, cy, s * 0.07, 'F');
      break;
    case 'warning':
      doc.line(cx, cy - s * 0.5, cx - s * 0.45, cy + s * 0.42);
      doc.line(cx - s * 0.45, cy + s * 0.42, cx + s * 0.45, cy + s * 0.42);
      doc.line(cx + s * 0.45, cy + s * 0.42, cx, cy - s * 0.5);
      doc.line(cx, cy - s * 0.18, cx, cy + s * 0.12);
      doc.circle(cx, cy + s * 0.28, s * 0.04, 'F');
      break;
    case 'comment':
      doc.roundedRect(cx - s * 0.45, cy - s * 0.34, s * 0.9, s * 0.58, 2, 2, 'S');
      doc.line(cx - s * 0.17, cy + s * 0.24, cx - s * 0.32, cy + s * 0.42);
      doc.line(cx - s * 0.32, cy + s * 0.42, cx - s * 0.03, cy + s * 0.24);
      break;
    case 'allergen':
      doc.circle(cx, cy, s * 0.42, 'S');
      doc.line(cx - s * 0.18, cy + s * 0.18, cx + s * 0.2, cy - s * 0.18);
      doc.line(cx - s * 0.18, cy - s * 0.18, cx + s * 0.2, cy + s * 0.18);
      break;
    default:
      doc.circle(cx, cy, s * 0.38, 'S');
  }
}

function drawChefOneLogo(doc: jsPDF, x: number, y: number, scale = 1, tagline = true): void {
  const iconSize = 25 * scale;
  drawIcon(doc, 'chef', x + iconSize / 2, y + 13 * scale, NAVY, iconSize);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24 * scale);
  doc.setTextColor(...NAVY);
  doc.text('Chef', x + 32 * scale, y + 21 * scale);
  doc.setTextColor(...ORANGE);
  doc.text('One', x + 88 * scale, y + 21 * scale);
  if (tagline) {
    doc.setFontSize(5.9 * scale);
    doc.setTextColor(...MUTED);
    doc.text('GESTIONA. CONTROLA. GANA.', x + 36 * scale, y + 34 * scale);
  }
}

function drawPageBackground(doc: jsPDF): void {
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, PW, PH, 'F');
}

function drawHeaderMeta(doc: jsPDF, payload: RecipePrintPayload): void {
  const recipe = payload.recipe;
  const sheet = payload.sheet;
  const kind = recipeKind(recipe, sheet);
  const metaX = 365;
  const metaY = 25;
  const colW = 88;
  const rowH = 35;
  const cells = [
    { icon: 'tag' as IconName, label: 'Código', value: safe(sheet?.codigoInterno, safe(recipe.posArticleCode, `REC-${recipe.id.slice(0, 5)}`)) },
    { icon: 'status' as IconName, label: 'Estado', value: sheet?.activa === false ? 'INACTIVA' : 'ACTIVA', status: true },
    { icon: 'plate' as IconName, label: 'Tipo', value: kind },
    { icon: 'calendar' as IconName, label: 'Fecha', value: printDate() },
  ];

  vRule(doc, metaX - 9, metaY - 5, metaY + rowH * 2 - 5, BORDER, 0.65);
  vRule(doc, metaX + colW + 12, metaY - 5, metaY + rowH * 2 - 5, BORDER, 0.65);
  vRule(doc, metaX + colW * 2 + 24, metaY - 5, metaY + rowH * 2 - 5, BORDER, 0.65);

  cells.forEach((cell, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = metaX + col * (colW + 24);
    const y = metaY + row * rowH;
    drawIcon(doc, cell.icon, x, y + 9, NAVY, 14);
    labelText(doc, cell.label, x + 17, y + 3, MUTED);
    if (cell.status) {
      const active = cell.value === 'ACTIVA';
      const w = active ? 42 : 50;
      doc.setFillColor(...(active ? GREEN : RED));
      doc.roundedRect(x + 17, y + 10, w, 13, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...WHITE);
      doc.text(cell.value, x + 17 + w / 2, y + 19.2, { align: 'center' });
      return;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...NAVY);
    doc.text(truncateToWidth(doc, cell.value, colW - 18), x + 17, y + 18);
  });
}

function drawPhotoPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(239, 236, 231);
  doc.rect(x, y, w, h, 'F');
  drawIcon(doc, 'chef', x + w / 2, y + h / 2 - 7, GRAY, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('FOTO OFICIAL DE LA RECETA', x + w / 2, y + h / 2 + 28, { align: 'center' });
}

function drawMetricCard(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    icon: IconName;
    tone: RGB;
    label: string;
    value: string;
    sub: string;
    filledIcon?: boolean;
  },
): void {
  card(doc, opts.x, opts.y, opts.w, opts.h, WHITE);
  if (opts.filledIcon) {
    doc.setFillColor(...opts.tone);
    doc.circle(opts.x + opts.w / 2, opts.y + 21, 11, 'F');
    drawIcon(doc, opts.icon, opts.x + opts.w / 2, opts.y + 21, WHITE, 13);
  } else {
    doc.setDrawColor(...opts.tone);
    doc.setLineWidth(0.8);
    doc.circle(opts.x + opts.w / 2, opts.y + 21, 11, 'S');
    drawIcon(doc, opts.icon, opts.x + opts.w / 2, opts.y + 21, opts.tone, 12);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.9);
  doc.setTextColor(...NAVY);
  doc.text(upper(opts.label), opts.x + opts.w / 2, opts.y + 43, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  let valueSize = 15.4;
  doc.setFontSize(valueSize);
  while (valueSize > 10 && (doc.getTextWidth(opts.value) as number) > opts.w - 10) {
    valueSize -= 0.5;
    doc.setFontSize(valueSize);
  }
  doc.setTextColor(...NAVY);
  doc.text(opts.value, opts.x + opts.w / 2, opts.y + 62, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.7);
  doc.setTextColor(...NAVY);
  doc.text(opts.sub, opts.x + opts.w / 2, opts.y + opts.h - 10, { align: 'center' });
}

function drawHero(doc: jsPDF, payload: RecipePrintPayload, photo: PhotoAsset | null, vals: ReturnType<typeof productionValues>): void {
  const { recipe, sheet } = payload;
  const photoX = 0;
  const photoY = 106;
  const photoW = 260;
  const photoH = 236;
  const heroX = 282;
  const heroW = PW - heroX - M;
  const kind = recipeKind(recipe, sheet);

  drawChefOneLogo(doc, 27, 27, 1, true);
  drawHeaderMeta(doc, payload);
  rule(doc, 104, 0, PW, BORDER, 0.55);

  if (photo) {
    doc.addImage(photo.dataUrl, 'JPEG', photoX, photoY, photoW, photoH);
  } else {
    drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
  }

  doc.setFont('helvetica', 'bold');
  let titleSize = 25;
  doc.setFontSize(titleSize);
  let allTitleLines = doc.splitTextToSize(upper(recipe.name, 'SIN NOMBRE'), heroW) as string[];
  while (titleSize > 18 && allTitleLines.length > 2) {
    titleSize -= 1;
    doc.setFontSize(titleSize);
    allTitleLines = doc.splitTextToSize(upper(recipe.name, 'SIN NOMBRE'), heroW) as string[];
  }
  const titleLines = allTitleLines.slice(0, 2);
  doc.setFontSize(titleSize);
  doc.setTextColor(...NAVY);
  doc.text(titleLines, heroX, 136);

  const titleBottom = 136 + (titleLines.length - 1) * (titleSize * 0.86);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...kindColor(kind));
  doc.text(upper(sheet?.categoria, kind), heroX, titleBottom + 17);

  const desc = safe(recipe.notes, safe(sheet?.emplatadoDescripcion, safe(sheet?.notasChef, '')));
  if (desc) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.7);
    doc.setTextColor(...NAVY);
    const lines = splitLines(doc, desc, heroW - 8, 3);
    doc.text(lines, heroX, titleBottom + 36, { lineHeightFactor: 1.22 });
  }

  rule(doc, 223, heroX, heroX + heroW, BORDER, 0.45);

  const metricY = 234;
  const gap = 5;
  const metricW = (heroW - gap * 3) / 4;
  const costValue = vals.costPerYield != null ? formatMoneyEur(vals.costPerYield) : '—';
  const operationalValue = vals.operationalCost != null ? formatMoneyEur(vals.operationalCost) : '—';
  const metrics = [
    {
      icon: 'coins' as IconName,
      tone: ORANGE,
      label: 'Coste real',
      value: costValue,
      sub: `por ${unitSingular(vals.outputUnit)}`,
      filledIcon: false,
    },
    {
      icon: 'percent' as IconName,
      tone: fcTone(vals.foodCost),
      label: 'Food cost',
      value: fmtPct(vals.foodCost),
      sub: 'sobre PVP',
      filledIcon: true,
    },
    {
      icon: 'chart' as IconName,
      tone: marginTone(vals.margin),
      label: 'Margen bruto',
      value: fmtPct(vals.margin),
      sub: 'sobre PVP',
      filledIcon: true,
    },
    {
      icon: 'clipboard' as IconName,
      tone: GRAY,
      label: 'Coste operativo',
      value: operationalValue,
      sub: vals.operationalCost != null ? `por ${unitSingular(vals.outputUnit)}` : 'por ración',
      filledIcon: false,
    },
  ];
  metrics.forEach((metric, i) => {
    drawMetricCard(doc, {
      ...metric,
      x: heroX + i * (metricW + gap),
      y: metricY,
      w: metricW,
      h: 84,
    });
  });
}

function sectionHeader(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  icon: IconName,
  title: string,
  tone: RGB,
  right?: string,
): void {
  drawIcon(doc, icon, x + 16, y + 17, tone, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...NAVY);
  doc.text(upper(title), x + 35, y + 20);
  if (right) {
    doc.setFontSize(6.5);
    doc.text(right, x + w - 14, y + 20, { align: 'right' });
  }
  rule(doc, y + 33, x + 12, x + w - 12, BORDER, 0.4);
}

function ingredientName(line: EscandalloLine): string {
  const sep = line.label.indexOf(' · ');
  return sep > 0 ? line.label.slice(sep + 3) : line.label;
}

function ingredientTone(line: EscandalloLine): RGB {
  if (line.sourceType === 'subrecipe') return ORANGE;
  if (line.sourceType === 'processed' || line.sourceType === 'central_kitchen') return AMBER;
  if (line.sourceType === 'manual') return GRAY;
  return [168, 102, 35];
}

function drawIngredientIcon(doc: jsPDF, line: EscandalloLine, cx: number, cy: number): void {
  const tone = ingredientTone(line);
  doc.setFillColor(...tone);
  if (line.sourceType === 'processed' || line.sourceType === 'central_kitchen') {
    doc.rect(cx - 6, cy - 6, 12, 12, 'F');
  } else if (line.sourceType === 'subrecipe') {
    doc.ellipse(cx, cy, 8, 5, 'F');
    doc.setFillColor(112, 60, 16);
    doc.ellipse(cx, cy - 2, 7, 3, 'F');
  } else {
    doc.ellipse(cx, cy, 8, 5, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.45);
    doc.ellipse(cx, cy, 6, 3.5, 'S');
  }
}

function drawIngredientRow(
  doc: jsPDF,
  payload: RecipePrintPayload,
  line: EscandalloLine,
  rowY: number,
  x: number,
  w: number,
  rowH: number,
): void {
  const supplier = lineSupplierName(line, payload.rawById);
  const tag = lineSourceTag(line);
  const name = tag ? `[${tag}] ${ingredientName(line)}` : ingredientName(line);
  drawIngredientIcon(doc, line, x + 18, rowY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...NAVY);
  doc.text(truncateToWidth(doc, upper(name), w - 145), x + 39, rowY + 10);

  if (supplier) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED);
    doc.text(truncateToWidth(doc, supplier, w - 145), x + 39, rowY + 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  doc.setTextColor(...NAVY);
  doc.text(fmtQty(line.qty, 3), x + w - 108, rowY + 15, { align: 'right' });
  doc.text(String(line.unit), x + w - 70, rowY + 15, { align: 'center' });
  doc.text(formatMoneyEur(lineCost(line, payload)), x + w - 13, rowY + 15, { align: 'right' });
  rule(doc, rowY + rowH - 1, x + 12, x + w - 12, BORDER, 0.32);
}

function drawIngredientsCard(
  doc: jsPDF,
  payload: RecipePrintPayload,
  vals: ReturnType<typeof productionValues>,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'basket', 'Ingredientes', ORANGE, `${payload.lines.length} ingredientes`);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(...NAVY);
  doc.text('INGREDIENTE', x + 39, y + 50);
  doc.text('CANTIDAD', x + w - 108, y + 50, { align: 'right' });
  doc.text('UNIDAD', x + w - 70, y + 50, { align: 'center' });
  doc.text('COSTE', x + w - 13, y + 50, { align: 'right' });

  const rowH = 31;
  const maxRows = 6;
  const rowStart = y + 59;
  const visibleLines = payload.lines.slice(0, maxRows);
  visibleLines.forEach((line, index) => {
    drawIngredientRow(doc, payload, line, rowStart + index * rowH, x, w, rowH);
  });

  const remaining = payload.lines.length - visibleLines.length;
  if (remaining > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.9);
    doc.setTextColor(...MUTED);
    doc.text(`+${remaining} ingredientes en página siguiente`, x + 39, y + h - 48);
  }

  doc.setFillColor(...ORANGE_SOFT);
  doc.roundedRect(x, y + h - 42, w, 42, 0, 0, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...ORANGE);
  doc.text('COSTE TOTAL PRODUCCIÓN', x + 14, y + h - 19);

  doc.setFontSize(17);
  doc.text(formatMoneyEur(payload.productionTotalCost), x + w - 14, y + h - 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...NAVY);
  const sub = vals.outputQty != null && vals.outputQty > 1
    ? `para ${fmtQty(vals.outputQty)} ${unitPlural(vals.outputUnit)}`
    : `por ${unitSingular(vals.outputUnit)}`;
  doc.text(sub, x + w - 14, y + h - 10, { align: 'right' });

  return visibleLines.length;
}

function productionCell(
  doc: jsPDF,
  x: number,
  y: number,
  icon: IconName,
  tone: RGB,
  label: string,
  value: string,
  maxW: number,
): void {
  drawIcon(doc, icon, x, y + 9, tone, 15);
  labelText(doc, label, x + 24, y + 3, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...NAVY);
  doc.text(truncateToWidth(doc, value, maxW), x + 24, y + 20);
}

function drawProductionCard(
  doc: jsPDF,
  payload: RecipePrintPayload,
  vals: ReturnType<typeof productionValues>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'gear', 'Producción', GRAY);
  const innerX = x + 18;
  const innerY = y + 47;
  const halfW = (w - 36) / 2;
  const halfH = (h - 49) / 2;
  vRule(doc, x + w / 2, innerY - 8, y + h - 18, BORDER, 0.35);
  rule(doc, innerY + halfH - 3, x + 12, x + w - 12, BORDER, 0.35);

  productionCell(
    doc,
    innerX,
    innerY,
    'tools',
    NAVY,
    'Salida',
    vals.outputQty != null ? `${fmtQty(vals.outputQty)} ${unitSingular(vals.outputUnit)}` : '—',
    halfW - 30,
  );
  productionCell(doc, innerX + halfW + 16, innerY, 'bowl', NAVY, 'Unidad de salida', unitPlural(vals.outputUnit), halfW - 30);
  productionCell(doc, innerX, innerY + halfH, 'percent', NAVY, 'Merma', fmtPct(vals.mermaPct), halfW - 30);
  productionCell(
    doc,
    innerX + halfW + 16,
    innerY + halfH,
    'coins',
    NAVY,
    'Coste real',
    vals.costPerYield != null ? `${formatMoneyEur(vals.costPerYield)} / ${unitSingular(vals.outputUnit)}` : '—',
    halfW - 26,
  );

  if (payload.creatorName?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(`Responsable: ${payload.creatorName.trim()}`, x + 12, y + h - 7);
  }
}

function stepText(step: EscandalloTechnicalSheetStep): string {
  return safe(`${step.titulo ? `${step.titulo}: ` : ''}${step.descripcion}`, '');
}

function drawStepsCard(
  doc: jsPDF,
  payload: RecipePrintPayload,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'chef', 'Pasos de producción', RED, `${payload.steps.length} pasos`);

  const rowH = 23;
  const maxSteps = 5;
  const visibleSteps = payload.steps.slice(0, maxSteps);
  const startY = y + 48;

  if (visibleSteps.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('—', x + 18, startY + 3);
    return 0;
  }

  visibleSteps.forEach((step, i) => {
    const rowY = startY + i * rowH;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.7);
    doc.circle(x + 20, rowY, 7, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...ORANGE);
    doc.text(String(i + 1), x + 20, rowY + 2.4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(truncateToWidth(doc, stepText(step), w - 51), x + 38, rowY + 2.5);
    rule(doc, rowY + 11, x + 38, x + w - 12, BORDER, 0.32);
  });

  const remaining = payload.steps.length - visibleSteps.length;
  if (remaining > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text(`+${remaining} pasos en página siguiente`, x + 38, y + h - 10);
  }

  return visibleSteps.length;
}

function drawConservationCard(
  doc: jsPDF,
  payload: RecipePrintPayload,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const s = payload.sheet;
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'snow', 'Conservación', BLUE);

  const fields: Array<[IconName, string, string]> = [
    ['temperature', 'Temperatura', safe(s?.temperaturaConservacion, '—')],
    ['calendar', 'Caducidad', safe(s?.vidaUtil, '—')],
    ['clipboard', 'Envasado', safe(s?.tipoConservacion, '—')],
    ['unit', 'Regeneración', safe(s?.regeneracion, '—')],
  ];
  const innerX = x + 18;
  const innerY = y + 47;
  const halfW = (w - 36) / 2;
  const rowH = 25;
  vRule(doc, x + w / 2, innerY - 8, y + h - 12, BORDER, 0.32);
  rule(doc, innerY + rowH - 4, x + 12, x + w - 12, BORDER, 0.32);

  fields.forEach(([icon, label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = innerX + col * (halfW + 16);
    const cy = innerY + row * rowH;
    drawIcon(doc, icon, cx, cy + 4, NAVY, 12);
    labelText(doc, label, cx + 19, cy + 2, NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...MUTED);
    doc.text(truncateToWidth(doc, value, halfW - 23), cx + 19, cy + 16);
  });
}

function allergenCode(row: RecipeAllergenRow): string {
  return safe(row.allergen?.code, safe(row.allergen_id)).toLowerCase();
}

function allergenName(row: RecipeAllergenRow): string {
  return safe(row.allergen?.name, safe(row.allergen_id, 'Alérgeno'));
}

function allergenTone(code: string): RGB {
  if (code.includes('gluten')) return ORANGE;
  if (code.includes('huevo')) return ORANGE;
  if (code.includes('leche') || code.includes('lact')) return BLUE;
  if (code.includes('soja')) return GREEN;
  if (code.includes('sulfit')) return PURPLE;
  if (code.includes('pesc')) return BLUE;
  if (code.includes('fruto') || code.includes('cacahuete')) return AMBER;
  return GRAY;
}

function drawAllergenSymbol(doc: jsPDF, code: string, cx: number, cy: number, tone: RGB): void {
  doc.setDrawColor(...tone);
  doc.setFillColor(...tone);
  doc.setLineWidth(0.9);
  if (code.includes('gluten')) {
    doc.line(cx, cy + 7, cx, cy - 7);
    for (let i = -5; i <= 3; i += 4) {
      doc.line(cx, cy + i, cx - 5, cy + i - 3);
      doc.line(cx, cy + i, cx + 5, cy + i - 3);
    }
  } else if (code.includes('huevo')) {
    doc.ellipse(cx, cy, 5.5, 7.5, 'S');
  } else if (code.includes('leche') || code.includes('lact')) {
    doc.roundedRect(cx - 4.5, cy - 7, 9, 14, 1.5, 1.5, 'S');
    doc.rect(cx - 3, cy - 10, 6, 3, 'S');
    doc.line(cx - 4.5, cy - 2, cx + 4.5, cy - 2);
  } else if (code.includes('soja')) {
    doc.ellipse(cx - 3, cy + 1, 4, 6, 'S');
    doc.ellipse(cx + 4, cy - 2, 4, 6, 'S');
    doc.line(cx - 7, cy + 5, cx + 8, cy - 7);
  } else if (code.includes('sulfit')) {
    doc.circle(cx, cy - 5, 3, 'S');
    doc.circle(cx - 6, cy + 4, 3, 'S');
    doc.circle(cx + 6, cy + 4, 3, 'S');
    doc.line(cx - 3, cy - 2, cx - 4, cy + 1);
    doc.line(cx + 3, cy - 2, cx + 4, cy + 1);
  } else {
    drawIcon(doc, 'allergen', cx, cy, tone, 14);
  }
}

function drawAllergensCard(
  doc: jsPDF,
  payload: RecipePrintPayload,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const active = payload.recipeAllergens.filter((a) => a.status !== 'excluded');
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'warning', 'Alérgenos', RED);

  if (active.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('—', x + 18, y + 57);
    return;
  }

  const shown = active.slice(0, 5);
  const itemW = (w - 24) / shown.length;
  shown.forEach((row, i) => {
    const code = allergenCode(row);
    const tone = allergenTone(code);
    const cx = x + 12 + itemW * i + itemW / 2;
    const cy = y + 55;
    doc.setDrawColor(...tone);
    doc.setLineWidth(0.8);
    doc.circle(cx, cy - 6, 13, 'S');
    drawAllergenSymbol(doc, code, cx, cy - 6, tone);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.3);
    doc.setTextColor(...NAVY);
    doc.text(truncateToWidth(doc, upper(allergenName(row)), itemW - 4), cx, y + h - 10, { align: 'center' });
  });

  if (active.length > shown.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(...MUTED);
    doc.text(`+${active.length - shown.length}`, x + w - 12, y + 44, { align: 'right' });
  }
}

function drawObservationsCard(doc: jsPDF, payload: RecipePrintPayload, x: number, y: number, w: number, h: number): void {
  const parts = [
    safe(payload.sheet?.notasChef),
    safe(payload.sheet?.puntosCriticos),
    safe(payload.sheet?.erroresComunes),
    safe(payload.sheet?.recomendaciones),
  ].filter(Boolean);
  const text = parts.join(' · ');
  card(doc, x, y, w, h, WHITE);
  sectionHeader(doc, x, y, w, 'comment', 'Observaciones', GRAY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...NAVY);
  doc.text(splitLines(doc, text || '—', w - 36, 2), x + 34, y + 47, { lineHeightFactor: 1.2 });
}

function drawFooter(doc: jsPDF, payload: RecipePrintPayload, page: number, total: number, qrDataUrl: string | null): void {
  rule(doc, FOOTER_TOP, M, PW - M, BORDER, 0.45);

  if (qrDataUrl && page === total) {
    doc.addImage(qrDataUrl, 'PNG', M + 1, FOOTER_TOP + 10, 34, 34);
  } else {
    doc.setDrawColor(...BORDER);
    doc.roundedRect(M + 1, FOOTER_TOP + 10, 34, 34, 2, 2, 'S');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.9);
  doc.setTextColor(...NAVY);
  doc.text('Escanea para ver esta receta', M + 48, FOOTER_TOP + 24);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...NAVY);
  doc.text('en ', M + 48, FOOTER_TOP + 34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE);
  doc.text('Chef One', M + 58, FOOTER_TOP + 34);

  vRule(doc, 205, FOOTER_TOP + 8, PH - 18, BORDER, 0.45);
  drawChefOneLogo(doc, PW / 2 - 45, FOOTER_TOP + 12, 0.58, true);
  vRule(doc, 392, FOOTER_TOP + 8, PH - 18, BORDER, 0.45);

  const code = safe(payload.sheet?.codigoInterno, safe(payload.recipe.posArticleCode, `REC-${payload.recipe.id.slice(0, 5)}`));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(...NAVY);
  doc.text(`Fecha impresión: ${printDateTime()}`, PW - M - 168, FOOTER_TOP + 25);
  doc.text(`Código: ${code}   |   Página ${page}/${total}`, PW - M - 168, FOOTER_TOP + 36);
}

function drawFirstPage(doc: jsPDF, payload: RecipePrintPayload, photo: PhotoAsset | null, vals: ReturnType<typeof productionValues>) {
  drawPageBackground(doc);
  drawHero(doc, payload, photo, vals);

  const gridY = 354;
  const gap = 8;
  const leftW = 302;
  const rightX = M + leftW + gap;
  const rightW = PW - M - rightX;
  const topCardH = 292;
  const ingredientOverflow = drawIngredientsCard(doc, payload, vals, M, gridY, leftW, topCardH);
  drawProductionCard(doc, payload, vals, rightX, gridY, rightW, 112);
  const stepOverflow = drawStepsCard(doc, payload, rightX, gridY + 120, rightW, 172);

  const lowerY = 646;
  drawConservationCard(doc, payload, M, lowerY, leftW, 78);
  drawAllergensCard(doc, payload, rightX, lowerY, rightW, 78);
  drawObservationsCard(doc, payload, M, 734, CW, 50);

  return { ingredientOverflow, stepOverflow };
}

function drawContinuationHeader(doc: jsPDF, payload: RecipePrintPayload): void {
  drawPageBackground(doc);
  drawChefOneLogo(doc, M, 26, 0.75, true);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(truncateToWidth(doc, upper(payload.recipe.name, 'RECETA'), 330), 170, 43);
  doc.setFontSize(7);
  doc.setTextColor(...ORANGE);
  doc.text('CONTINUACIÓN DE FICHA TÉCNICA', 170, 56);
  rule(doc, 76, M, PW - M, BORDER, 0.5);
}

function drawContinuationSectionTitle(doc: jsPDF, title: string, count: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(upper(title), M, y);
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text(count, PW - M, y, { align: 'right' });
  rule(doc, y + 8, M, PW - M, BORDER, 0.35);
  return y + 22;
}

function addContinuationPages(doc: jsPDF, payload: RecipePrintPayload, ingredientStart: number, stepStart: number): void {
  if (ingredientStart >= payload.lines.length && stepStart >= payload.steps.length) return;

  doc.addPage();
  drawContinuationHeader(doc, payload);
  let y = 102;

  if (ingredientStart < payload.lines.length) {
    y = drawContinuationSectionTitle(
      doc,
      'Ingredientes restantes',
      `${payload.lines.length - ingredientStart} ingredientes`,
      y,
    );
    const rowH = 26;
    for (let i = ingredientStart; i < payload.lines.length; i += 1) {
      if (y + rowH > SAFE_B) {
        doc.addPage();
        drawContinuationHeader(doc, payload);
        y = drawContinuationSectionTitle(doc, 'Ingredientes restantes', 'continuación', 102);
      }
      drawIngredientRow(doc, payload, payload.lines[i]!, y - 8, M, CW, rowH);
      y += rowH;
    }
    y += 14;
  }

  if (stepStart < payload.steps.length) {
    if (y + 44 > SAFE_B) {
      doc.addPage();
      drawContinuationHeader(doc, payload);
      y = 102;
    }
    y = drawContinuationSectionTitle(doc, 'Pasos restantes', `${payload.steps.length - stepStart} pasos`, y);
    for (let i = stepStart; i < payload.steps.length; i += 1) {
      const step = payload.steps[i];
      if (!step) continue;
      const lines = splitLines(doc, stepText(step), CW - 42, 5);
      const rowH = Math.max(24, lines.length * 9 + 10);
      if (y + rowH > SAFE_B) {
        doc.addPage();
        drawContinuationHeader(doc, payload);
        y = drawContinuationSectionTitle(doc, 'Pasos restantes', 'continuación', 102);
      }
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.75);
      doc.circle(M + 11, y + 7, 7, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.7);
      doc.setTextColor(...ORANGE);
      doc.text(String(i + 1), M + 11, y + 9.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...NAVY);
      doc.text(lines, M + 31, y + 8, { lineHeightFactor: 1.18 });
      rule(doc, y + rowH - 2, M + 31, PW - M, BORDER, 0.3);
      y += rowH;
    }
  }
}

export async function printRecipePDF(payload: RecipePrintPayload): Promise<void> {
  const photoAspect = 236 / 260;
  const [photo, qrDataUrl] = await Promise.all([
    loadPhoto(getOfficialRecipePhotoUrl(payload.sheet), photoAspect),
    (async () => {
      if (typeof window === 'undefined') return null;
      const url = `${window.location.origin}/escandallos/recetas/${payload.recipe.id}/editar`;
      return QRCode.toDataURL(url, { margin: 1, width: 160 });
    })(),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const vals = productionValues(payload);
  const overflow = drawFirstPage(doc, payload, photo, vals);
  addContinuationPages(doc, payload, overflow.ingredientOverflow, overflow.stepOverflow);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    drawFooter(doc, payload, p, total, qrDataUrl);
  }

  const blobUrl = doc.output('bloburl');
  if (typeof window !== 'undefined') {
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  doc.save(`chef-one-${safeFileName(payload.recipe.name)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
