import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { presenceLabel, type RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import { rawIngredientWeightDetail, totalInputWeightKg } from '@/lib/escandallo-input-weight';
import {
  computeMermaPct,
  computeOperationalCost,
  computeYieldCostPerUnit,
  type EscandalloYieldUnit,
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

type RGB = [number, number, number];
type LogoAsset = { dataUrl: string; width: number; height: number };
type DocWithTable = jsPDF & { lastAutoTable?: { finalY?: number } };

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
  linesByRecipe: Record<string, EscandalloLine[]>;
  productionTotalCost: number;
  creatorName?: string | null;
  localName?: string | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MM = 2.8346456693;
const MARGIN_TOP = 12 * MM;
const MARGIN_BOTTOM = 10 * MM;
const MARGIN_X = 10 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const WHITE: RGB = [255, 255, 255];
const INK: RGB = [10, 9, 8];
const MUTED: RGB = [126, 116, 104];
const BORDER: RGB = [224, 216, 206];
const SOFT: RGB = [250, 248, 245];
const TERRA: RGB = [196, 83, 31];
const RED: RGB = [220, 38, 38];
const OLIVE: RGB = [74, 107, 58];
const GOLD: RGB = [184, 135, 42];
const PALE_GREEN: RGB = [246, 250, 244];
const PALE_TERRA: RGB = [253, 244, 241];

const OFFICIAL_CHEF_LOGO_SRC = '/logo-oficial-chef.svg';
let logoPromise: Promise<LogoAsset | null> | null = null;

function asDateTime(value = new Date()): string {
  return value.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQty(value: number | null | undefined, max = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('es-ES', { maximumFractionDigits: max });
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

function safeText(value: string | null | undefined, fallback = '—'): string {
  const v = String(value ?? '').trim();
  return v || fallback;
}

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'receta';
}

function recipeKind(recipe: EscandalloRecipe, sheet: EscandalloTechnicalSheet | null): 'PLATO' | 'BASE' | 'ELABORACIÓN' {
  if (!recipe.isSubRecipe) return 'PLATO';
  const category = `${sheet?.categoria ?? ''}`.toLowerCase();
  if (category.includes('elabor')) return 'ELABORACIÓN';
  return 'BASE';
}

function kindColor(kind: 'PLATO' | 'BASE' | 'ELABORACIÓN'): RGB {
  if (kind === 'BASE') return OLIVE;
  if (kind === 'ELABORACIÓN') return GOLD;
  return TERRA;
}

function metricTone(label: string, value: number | null): RGB {
  if (label === 'Margen bruto') {
    if (value == null) return INK;
    if (value > 65) return OLIVE;
    if (value >= 35) return GOLD;
    return TERRA;
  }
  if (label === 'Food cost') {
    if (value == null) return INK;
    if (value < 30) return OLIVE;
    if (value <= 35) return GOLD;
    return TERRA;
  }
  return INK;
}

async function loadOfficialChefLogo(): Promise<LogoAsset | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (logoPromise) return logoPromise;

  logoPromise = (async () => {
    try {
      const response = await fetch(OFFICIAL_CHEF_LOGO_SRC);
      if (!response.ok) return null;
      const svgText = await response.text();
      const transparentSvg = svgText.replace(/<rect\b[^>]*fill="#ffffff"[^>]*\/>/gi, '');
      const img = new Image();
      const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(transparentSvg)}`;
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = encodedSvg;
      });
      if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = 538;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = (53 / 375) * loaded.naturalWidth;
      const sy = (154 / 375) * loaded.naturalHeight;
      const sw = (269 / 375) * loaded.naturalWidth;
      const sh = (64 / 375) * loaded.naturalHeight;
      ctx.drawImage(loaded, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } catch {
      return null;
    }
  })();

  return logoPromise;
}

async function loadImageDataUrl(src: string | null | undefined): Promise<string | null> {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    const normalizedSrc = src.trim();
    const isInlineSrc =
      normalizedSrc.startsWith('data:') ||
      normalizedSrc.startsWith('blob:') ||
      normalizedSrc.startsWith('/');
    if (!isInlineSrc) {
      img.crossOrigin = 'anonymous';
    }
    const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = normalizedSrc;
    });
    if (!loaded || loaded.naturalWidth <= 0 || loaded.naturalHeight <= 0) return null;
    const canvas = document.createElement('canvas');
    const targetW = 640;
    const targetH = Math.round((loaded.naturalHeight / loaded.naturalWidth) * targetW);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loaded, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

function drawLogo(doc: jsPDF, logo: LogoAsset | null, y: number, width = 128): void {
  const x = (PAGE_W - width) / 2;
  if (!logo) {
    doc.setFont('times', 'normal');
    doc.setFontSize(30);
    doc.setTextColor(...RED);
    doc.text('Chef One', PAGE_W / 2, y + 26, { align: 'center' });
    return;
  }
  doc.addImage(logo.dataUrl, 'PNG', x, y, width, (width * logo.height) / logo.width);
}

function drawRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
}

function drawBadge(doc: jsPDF, x: number, y: number, label: string, color: RGB): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const w = Math.max(44, doc.getTextWidth(label) + 16);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...color);
  doc.roundedRect(x, y, w, 18, 5, 5, 'FD');
  doc.setTextColor(...color);
  doc.text(label, x + w / 2, y + 12, { align: 'center' });
  return w;
}

function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB = WHITE): void {
  doc.setFillColor(...fill);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, h, 7, 7, 'FD');
}

function drawSectionTitle(doc: jsPDF, x: number, y: number, title: string, color: RGB = RED): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...color);
  doc.text(title.toUpperCase(), x, y);
}

function drawKeyValue(doc: jsPDF, x: number, y: number, label: string, value: string, valueColor: RGB = INK): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(label, x, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(...valueColor);
  doc.text(value, x, y + 12);
}

function splitNotes(doc: jsPDF, text: string | null | undefined, width: number): string[] {
  const value = safeText(text, '');
  if (!value) return [];
  return doc.splitTextToSize(value, width) as string[];
}

function addPageIfNeeded(doc: jsPDF, y: number, needed: number, logo: LogoAsset | null, recipeName: string, code: string): number {
  if (y + needed <= PAGE_H - MARGIN_BOTTOM - 10) return y;
  doc.addPage();
  drawMiniHeader(doc, logo, recipeName, code);
  return MARGIN_TOP + 18;
}

function drawMiniHeader(doc: jsPDF, logo: LogoAsset | null, recipeName: string, code: string): void {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  drawLogo(doc, logo, 8, 84);
  drawRule(doc, 38);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(recipeName, MARGIN_X, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(code, PAGE_W - MARGIN_X, 54, { align: 'right' });
}

function drawFooter(doc: jsPDF, page: number, total: number, payload: RecipePrintPayload, code: string): void {
  const y = PAGE_H - 12;
  const chefLabel = safeText(payload.creatorName, safeText(payload.localName, 'Chef One'));
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y - 8, PAGE_W - MARGIN_X, y - 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...MUTED);
  doc.text(`Fecha impresión: ${asDateTime()}   |   Usuario: ${chefLabel}`, MARGIN_X, y);
  doc.text(`Código: ${code}   |   Página ${page}/${total}`, PAGE_W - MARGIN_X, y, { align: 'right' });
}

function parseLineName(label: string): { supplier?: string; name: string } {
  const sep = label.indexOf(' · ');
  if (sep > 0) return { supplier: label.slice(0, sep), name: label.slice(sep + 3) };
  return { name: label };
}

function lineSourceBadge(line: EscandalloLine): string {
  if (line.sourceType === 'subrecipe') return line.subRecipeUsageMode === 'standard_portion' ? 'BASE' : 'BASE';
  if (line.sourceType === 'processed') return 'ELABORACIÓN';
  if (line.sourceType === 'manual') return 'MANUAL';
  return '';
}

function lineSupplier(line: EscandalloLine, rawById: Map<string, EscandalloRawProduct>): string {
  if (line.sourceType === 'raw' && line.rawSupplierProductId) {
    return rawById.get(line.rawSupplierProductId)?.supplierName ?? '—';
  }
  if (line.sourceType === 'processed') return 'Elaboración propia';
  if (line.sourceType === 'subrecipe') return 'Chef One';
  return '—';
}

function lineCost(
  line: EscandalloLine,
  payload: RecipePrintPayload,
): number {
  const unitPrice = lineUnitPriceEur(line, payload.rawById, payload.processedById, {
    linesByRecipe: payload.linesByRecipe,
    recipesById: payload.recipesById,
    technicalSheetsByRecipe: payload.technicalSheetsByRecipe,
    expanding: new Set([payload.recipe.id]),
  });
  return Math.round(line.qty * unitPrice * 10000) / 10000;
}

function productionValues(payload: RecipePrintPayload): {
  kind: 'PLATO' | 'BASE' | 'ELABORACIÓN';
  costPerYield: number | null;
  foodCost: number | null;
  margin: number | null;
  operationalCost: number | null;
  inputKg: number | null;
  outputQty: number | null;
  outputUnit: string;
  mermaPct: number | null;
} {
  const { recipe, sheet, productionTotalCost, rawById, lines } = payload;
  const kind = recipeKind(recipe, sheet);
  const outputQty =
    sheet?.yieldQuantity != null && Number.isFinite(sheet.yieldQuantity) && sheet.yieldQuantity > 0
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
  const inputWeight = totalInputWeightKg(lines, rawById);
  const inputKg = inputWeight.kg > 0 ? inputWeight.kg : null;
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
  const foodCost = !recipe.isSubRecipe ? foodCostPercentOfNetSale(productionTotalCost, recipe.yieldQty || 1, netSale) : null;
  const margin = foodCost != null ? Math.round((100 - foodCost) * 10) / 10 : null;

  return { kind, costPerYield, foodCost, margin, operationalCost, inputKg, outputQty, outputUnit, mermaPct };
}

function addMetricCards(doc: jsPDF, payload: RecipePrintPayload, values: ReturnType<typeof productionValues>, y: number): number {
  const gap = 8;
  const w = (CONTENT_W - gap * 3) / 4;
  const h = 34;
  const metrics = [
    {
      label: 'Coste real',
      value: values.costPerYield != null ? `${formatMoneyEur(values.costPerYield)}/${values.outputUnit}` : '—',
      raw: values.costPerYield,
    },
    {
      label: 'Food cost',
      value: values.foodCost != null ? formatPct(values.foodCost) : '—',
      raw: values.foodCost,
    },
    {
      label: 'Margen bruto',
      value: values.margin != null ? formatPct(values.margin) : '—',
      raw: values.margin,
    },
    {
      label: 'Coste operativo',
      value: values.operationalCost != null ? formatMoneyEur(values.operationalCost) : '—',
      raw: values.operationalCost,
    },
  ];

  metrics.forEach((m, i) => {
    const x = MARGIN_X + i * (w + gap);
    drawCard(doc, x, y, w, h, WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...RED);
    doc.text(m.label.toUpperCase(), x + 8, y + 11);
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...metricTone(m.label, m.raw));
    doc.text(m.value, x + 8, y + 24);
  });
  return y + h + 6;
}

function addHeader(doc: jsPDF, payload: RecipePrintPayload, logo: LogoAsset | null, photoDataUrl: string | null): { y: number; code: string } {
  const { recipe, sheet } = payload;
  const values = productionValues(payload);
  const kind = values.kind;
  const code = safeText(recipe.posArticleCode ?? sheet?.codigoInterno, kind === 'PLATO' ? `PLT-${recipe.id.slice(0, 4)}` : `BASE-${recipe.id.slice(0, 4)}`);
  const category = safeText(sheet?.categoria, kind === 'PLATO' ? 'Plato' : kind === 'BASE' ? 'Base' : 'Elaboración');

  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  drawLogo(doc, logo, 6, 132);
  drawRule(doc, 40);

  const leftX = MARGIN_X;
  const titleY = 76;
  const photoW = kind === 'PLATO' ? 96 : 88;
  const photoH = kind === 'PLATO' ? 88 : 72;
  const photoX = PAGE_W - MARGIN_X - photoW;
  const photoY = 48;

  doc.setFont('times', 'bold');
  doc.setFontSize(kind === 'PLATO' ? 22 : 20);
  doc.setTextColor(...INK);
  const nameLines = doc.splitTextToSize(safeText(recipe.name, 'Receta sin nombre'), photoX - leftX - 22) as string[];
  doc.text(nameLines.slice(0, 2), leftX, titleY);
  drawBadge(doc, leftX + Math.min(doc.getTextWidth(nameLines[0] ?? ''), photoX - leftX - 90) + 10, titleY - 16, kind, kindColor(kind));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const notes = splitNotes(doc, recipe.notes, photoX - leftX - 28);
  doc.text(notes.slice(0, 1).length ? notes.slice(0, 1) : [category], leftX, titleY + 20);

  if (photoDataUrl) {
    drawCard(doc, photoX, photoY, photoW, photoH, WHITE);
    doc.addImage(photoDataUrl, 'JPEG', photoX + 2, photoY + 2, photoW - 4, photoH - 4);
  }

  const factsY = 124;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(leftX, factsY - 12, photoDataUrl ? photoX - 12 : PAGE_W - MARGIN_X, factsY - 12);
  const metadataRight = photoDataUrl ? photoX - 12 : PAGE_W - MARGIN_X;
  const factW = (metadataRight - leftX) / 5;
  const facts: [string, string][] = [
    ['Tipo', kind],
    ['Categoría', category],
    ['Código', code],
    ['Estado', sheet?.activa === false ? 'Inactiva' : 'Activa'],
    ['Fecha', asDateTime().slice(0, 10)],
  ];
  facts.forEach(([label, value], i) => {
    const x = leftX + i * factW;
    if (i > 0) doc.line(x - 7, factsY - 5, x - 7, factsY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(label, x, factsY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...INK);
    doc.text(value, x, factsY + 10);
  });

  return { y: addMetricCards(doc, payload, values, 148), code };
}

function addProductionAndUsage(doc: jsPDF, payload: RecipePrintPayload, y: number, values: ReturnType<typeof productionValues>): number {
  const h = 108;
  y = addPageIfNeeded(doc, y, h, null, payload.recipe.name, payload.recipe.posArticleCode ?? '');

  drawCard(doc, MARGIN_X, y, CONTENT_W, h, WHITE);
  drawSectionTitle(doc, MARGIN_X + 10, y + 16, 'Producción operativa');
  const third = (CONTENT_W - 20) / 3;
  const leftRows: [string, string, RGB?][] = [
    ['Entrada total', values.inputKg != null ? `${formatQty(values.inputKg, 3)} kg` : '—'],
    ['Salida', values.outputQty != null ? `${formatQty(values.outputQty)} ${values.outputUnit}` : '—'],
    ['Merma', formatPct(values.mermaPct), values.mermaPct != null && values.mermaPct > 30 ? TERRA : INK],
    ['Unidad salida', values.outputUnit],
    ['Coste real', values.costPerYield != null ? `${formatMoneyEur(values.costPerYield)}/${values.outputUnit}` : '—'],
    ['Coste operativo', values.operationalCost != null ? formatMoneyEur(values.operationalCost) : '—', OLIVE],
  ];
  leftRows.forEach(([label, value, color], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawKeyValue(doc, MARGIN_X + 10 + col * third, y + 30 + row * 26, label, value, color ?? INK);
  });
  const usageType =
    payload.sheet?.operationalUsageType === 'standard_portion'
      ? 'Ración estándar'
      : payload.sheet?.operationalUsageType === 'unit'
        ? 'Unidad'
        : payload.sheet?.operationalUsageType === 'volume'
          ? 'Volumen'
          : payload.sheet?.operationalUsageType === 'weight'
            ? 'Peso'
            : 'Pendiente';
  const usageRows: [string, string][] = [
    ['Tipo uso', usageType],
    ['Cantidad', payload.sheet?.operationalQuantity != null ? formatQty(payload.sheet.operationalQuantity) : '—'],
    ['Unidad', safeText(payload.sheet?.operationalUnit)],
  ];
  usageRows.forEach(([label, value], i) => {
    drawKeyValue(doc, MARGIN_X + 10 + i * third, y + 86, label, value);
  });
  return y + h + 6;
}

function addIngredients(doc: DocWithTable, payload: RecipePrintPayload, y: number, logo: LogoAsset | null, code: string): number {
  y = addPageIfNeeded(doc, y, 104, logo, payload.recipe.name, code);
  drawCard(doc, MARGIN_X, y, CONTENT_W, 30, WHITE);
  drawSectionTitle(doc, MARGIN_X + 12, y + 19, 'Ingredientes');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`${payload.lines.length} ingredientes`, PAGE_W - MARGIN_X - 12, y + 19, { align: 'right' });
  y += 36;

  const body = payload.lines.map((line) => {
    const parsed = parseLineName(line.label);
    const badge = lineSourceBadge(line);
    const raw = line.rawSupplierProductId ? payload.rawById.get(line.rawSupplierProductId) : null;
    const weightDetail = line.sourceType === 'raw' ? rawIngredientWeightDetail(line.qty, line.unit, raw) : null;
    const provider = lineSupplier(line, payload.rawById);
    const details = [weightDetail, provider !== '—' ? provider : ''].filter(Boolean).join(' · ');
    const name = `${badge ? `[${badge}] ` : ''}${parsed.name}${details ? `\n${details}` : ''}`;
    return [
      name,
      formatQty(line.qty, 3),
      String(line.unit),
      formatMoneyEur(lineCost(line, payload)),
    ];
  });
  if (body.length === 0) body.push(['Sin ingredientes', '—', '—', '—']);

  autoTable(doc, {
    startY: y,
    head: [['Ingrediente', 'Cantidad', 'Unidad', 'Coste']],
    body,
    margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP + 16, bottom: MARGIN_BOTTOM + 10 },
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      textColor: INK,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      lineColor: BORDER,
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: SOFT,
      textColor: INK,
      fontStyle: 'bold',
      fontSize: 6.2,
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [253, 252, 250] },
    columnStyles: {
      0: { cellWidth: 284 },
      1: { halign: 'right', cellWidth: 56 },
      2: { halign: 'center', cellWidth: 46 },
      3: { halign: 'right', cellWidth: 62 },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawMiniHeader(doc, logo, payload.recipe.name, code);
    },
  });

  y = doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY + 5 : y + 74;
  y = addPageIfNeeded(doc, y, 26, logo, payload.recipe.name, code);
  doc.setFillColor(...PALE_TERRA);
  doc.setDrawColor(244, 220, 214);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, 24, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...RED);
  doc.text('COSTE TOTAL PRODUCCIÓN', MARGIN_X + 12, y + 15);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(formatMoneyEur(payload.productionTotalCost), PAGE_W - MARGIN_X - 12, y + 17, { align: 'right' });
  return y + 30;
}

function addSteps(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null, code: string): number {
  const steps = payload.steps.length
    ? payload.steps
    : [
        {
          id: 'empty',
          localId: '',
          technicalSheetId: '',
          orden: 1,
          titulo: '',
          descripcion: 'Sin pasos definidos.',
          createdAt: '',
        },
      ];
  const estimated = Math.min(124, 26 + steps.length * 15);
  y = addPageIfNeeded(doc, y, estimated, logo, payload.recipe.name, code);
  drawCard(doc, MARGIN_X, y, CONTENT_W, estimated, WHITE);
  drawSectionTitle(doc, MARGIN_X + 12, y + 18, 'Pasos de producción');
  let cursor = y + 32;
  for (const [idx, step] of steps.entries()) {
    const text = safeText(`${step.titulo ? `${step.titulo}: ` : ''}${step.descripcion}`, '—');
    const lines = doc.splitTextToSize(text, CONTENT_W - 50) as string[];
    doc.setFillColor(...RED);
    doc.circle(MARGIN_X + 18, cursor - 2, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    doc.text(String(idx + 1), MARGIN_X + 18, cursor - 0.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...INK);
    doc.text(lines, MARGIN_X + 30, cursor);
    cursor += Math.max(12, lines.length * 8 + 4);
    if (cursor > y + estimated - 10 && idx < steps.length - 1) {
      y = cursor + 4;
      return addSteps(doc, { ...payload, steps: steps.slice(idx + 1) }, y, logo, code);
    }
  }
  return y + estimated + 6;
}

function addConservationAndAllergens(doc: jsPDF, payload: RecipePrintPayload, y: number, logo: LogoAsset | null, code: string): number {
  const h = 78;
  y = addPageIfNeeded(doc, y, h, logo, payload.recipe.name, code);

  const sheet = payload.sheet;
  drawCard(doc, MARGIN_X, y, CONTENT_W, h, WHITE);
  drawSectionTitle(doc, MARGIN_X + 12, y + 18, 'Conservación y alérgenos');
  const splitX = MARGIN_X + CONTENT_W * 0.54;
  doc.setDrawColor(...BORDER);
  doc.line(splitX, y + 10, splitX, y + h - 10);
  const conservation: [string, string][] = [
    ['Temperatura', safeText(sheet?.temperaturaConservacion)],
    ['Caducidad', safeText(sheet?.vidaUtil)],
    ['Envasado', safeText(sheet?.tipoConservacion)],
    ['Regeneración', safeText(sheet?.regeneracion)],
  ];
  conservation.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawKeyValue(doc, MARGIN_X + 12 + col * 112, y + 28 + row * 22, label, value);
  });

  const ax = splitX + 10;
  const active = payload.recipeAllergens.filter((a) => a.status !== 'excluded');
  if (active.length === 0) {
    doc.setFillColor(...PALE_GREEN);
    doc.setDrawColor(212, 226, 204);
    doc.roundedRect(ax, y + 24, 90, 18, 9, 9, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...OLIVE);
    doc.text('Ninguno detectado', ax + 45, y + 35.5, { align: 'center' });
  } else {
    active.slice(0, 12).forEach((row, i) => {
      const col = i % 3;
      const line = Math.floor(i / 3);
      const chipX = ax + col * 70;
      const chipY = y + 22 + line * 14;
      const label = safeText(row.allergen?.name ?? row.allergen_id);
      doc.setFillColor(row.presence_type === 'contains' ? 253 : 255, row.presence_type === 'contains' ? 244 : 251, row.presence_type === 'contains' ? 241 : 248);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(chipX, chipY, 62, 10, 5, 5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(row.presence_type === 'contains' ? TERRA[0] : GOLD[0], row.presence_type === 'contains' ? TERRA[1] : GOLD[1], row.presence_type === 'contains' ? TERRA[2] : GOLD[2]);
      doc.text(label.slice(0, 14), chipX + 3, chipY + 6.8);
      if (line === 3 && col === 2 && active.length > 12) {
        doc.text(`+${active.length - 12}`, chipX + 58, chipY + 6.8, { align: 'right' });
      }
    });
  }
  return y + h + 6;
}

function addObservationsAndQr(doc: jsPDF, payload: RecipePrintPayload, y: number, qrDataUrl: string | null, logo: LogoAsset | null, code: string, values: ReturnType<typeof productionValues>): number {
  y = addPageIfNeeded(doc, y, 58, logo, payload.recipe.name, code);
  const obsSource = safeText(payload.sheet?.notasChef ?? payload.recipe.notes, '—');
  const obs = obsSource === '—' ? obsSource : `${obsSource}`.slice(0, 180);
  const qrW = qrDataUrl ? 54 : 0;
  const obsW = CONTENT_W - qrW - (qrDataUrl ? 8 : 0);
  drawCard(doc, MARGIN_X, y, obsW, 34, WHITE);
  drawSectionTitle(doc, MARGIN_X + 12, y + 16, 'Observaciones');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  const lines = (doc.splitTextToSize(obs, obsW - 20) as string[]).slice(0, 3);
  doc.text(lines, MARGIN_X + 12, y + 28);

  if (qrDataUrl) {
    const qx = MARGIN_X + obsW + 8;
    drawCard(doc, qx, y, qrW, 34, WHITE);
    doc.addImage(qrDataUrl, 'PNG', qx + 4, y + 4, 26, 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...INK);
    doc.text('Chef One', qx + 34, y + 15, { align: 'left' });
    doc.setFont('helvetica', 'normal');
    doc.text(code, qx + 34, y + 23, { align: 'left' });
  }

  y += 40;
  y = addPageIfNeeded(doc, y, 28, logo, payload.recipe.name, code);
  drawCard(doc, MARGIN_X, y, CONTENT_W, 24, WHITE);
  const summary: [string, string, RGB?][] = [
    ['COSTE REAL', values.costPerYield != null ? `${formatMoneyEur(values.costPerYield)}/${values.outputUnit}` : '—'],
    ['COSTE OPERATIVO', values.operationalCost != null ? formatMoneyEur(values.operationalCost) : '—', OLIVE],
    [payload.recipe.isSubRecipe ? 'MERMA' : 'MARGEN BRUTO', payload.recipe.isSubRecipe ? formatPct(values.mermaPct) : formatPct(values.margin), values.margin != null && values.margin > 65 ? OLIVE : TERRA],
    ['VERSIÓN', 'v1.0'],
    ['USUARIO', safeText(payload.creatorName ?? payload.localName).slice(0, 18)],
    ['CÓDIGO', code],
  ];
  summary.forEach(([label, value, color], i) => {
    const cellW = CONTENT_W / summary.length;
    const x = MARGIN_X + 10 + i * cellW;
    if (i > 0) {
      doc.setDrawColor(...BORDER);
      doc.line(MARGIN_X + i * cellW, y + 5, MARGIN_X + i * cellW, y + 19);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(...RED);
    doc.text(label, x, y + 10);
    doc.setFont('times', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...(color ?? INK));
    doc.text(value, x, y + 18);
  });
  return y + 30;
}

export async function printRecipePDF(payload: RecipePrintPayload): Promise<void> {
  const logo = await loadOfficialChefLogo();
  const photoDataUrl = await loadImageDataUrl(getOfficialRecipePhotoUrl(payload.sheet));
  const recipeUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/escandallos/recetas/${payload.recipe.id}/editar`
      : '';
  const qrDataUrl = recipeUrl ? await QRCode.toDataURL(recipeUrl, { margin: 1, width: 180 }) : null;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' }) as DocWithTable;
  const values = productionValues(payload);
  const header = addHeader(doc, payload, logo, photoDataUrl);
  let y = header.y;
  y = addProductionAndUsage(doc, payload, y, values);
  y = addIngredients(doc, payload, y, logo, header.code);
  y = addSteps(doc, payload, y, logo, header.code);
  y = addConservationAndAllergens(doc, payload, y, logo, header.code);
  addObservationsAndQr(doc, payload, y, qrDataUrl, logo, header.code, values);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    drawFooter(doc, p, total, payload, header.code);
  }

  const blobUrl = doc.output('bloburl');
  if (typeof window !== 'undefined') {
    const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }
  doc.save(`chef-one-${safeFileName(payload.recipe.name)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
