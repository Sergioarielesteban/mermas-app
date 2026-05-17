/**
 * Contrato tipado del OCR de albaranes con Document AI + Gemini.
 *
 * Estos tipos son la "verdad" que ve el cliente y se persisten en `delivery_notes`
 * (cabecera) y `delivery_note_items` (líneas) tras la extracción. NO incluyen IDs
 * de Supabase porque viven aguas arriba de la persistencia.
 */

import type { Unit } from '@/lib/types';

export type OcrConfidence = 'low' | 'medium' | 'high';

/** Unidades reconocidas por el OCR. Coinciden con `Unit` salvo casos especiales. */
export const ALBARAN_OCR_UNITS = [
  'kg',
  'ud',
  'caja',
  'bolsa',
  'paquete',
  'bandeja',
  'racion',
  'g',
  'l',
  'ml',
] as const;
export type AlbaranOcrUnit = (typeof ALBARAN_OCR_UNITS)[number];

export type AlbaranOcrSupplier = {
  name: string | null;
  cif: string | null;
  email: string | null;
  phone: string | null;
  confidence: OcrConfidence;
};

export type AlbaranOcrDocument = {
  /** Número de albarán / referencia detectada. */
  number: string | null;
  /** Fecha de entrega en formato `YYYY-MM-DD`. */
  date: string | null;
  /** Número de pedido del proveedor si aparece en el documento. */
  orderReference: string | null;
  paymentTerms: string | null;
  confidence: OcrConfidence;
};

export type AlbaranOcrLine = {
  /** Texto literal de la línea (para auditoría / debugging). */
  rawText: string;
  /** Código interno del proveedor si aparece. */
  supplierProductCode: string | null;
  description: string;
  quantity: number | null;
  unit: AlbaranOcrUnit | null;
  /**
   * Precio por unidad detectado. La unidad coincide con `unit`. El normalizador
   * decide si esto debe compararse contra `pricePerUnit` o contra `pricePerKg`
   * del catálogo según la unidad real de compra del artículo master.
   */
  unitPrice: number | null;
  /** Importe total de la línea (cantidad × precio − descuento). */
  lineTotal: number | null;
  vatRate: number | null;
  discountPct: number | null;
  /** Peso real detectado para productos que se venden por peso aunque vengan en cajas. */
  weightKg: number | null;
  confidence: OcrConfidence;
  /** Avisos específicos de la línea (campos sospechosos, dudas OCR, etc.). */
  warnings: string[];
};

export type AlbaranOcrTotals = {
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number | null;
  discountAmount: number | null;
  total: number | null;
  confidence: OcrConfidence;
};

export type AlbaranOcrPayload = {
  provider: 'document-ai+gemini' | 'document-ai-only';
  supplier: AlbaranOcrSupplier;
  document: AlbaranOcrDocument;
  lines: AlbaranOcrLine[];
  totals: AlbaranOcrTotals;
  observations: string;
  /** Texto plano OCR (auditable). */
  ocrText: string;
  /** Avisos globales del documento. */
  warnings: string[];
  /** Metainformación del modelo. */
  meta: {
    documentAiProcessor?: string;
    geminiModel?: string;
    documentAiDurationMs?: number;
    geminiDurationMs?: number;
    totalDurationMs: number;
    pageCount?: number;
    mimeType?: string;
  };
};

/**
 * Reporte de diferencias detectadas tras cruzar líneas OCR con un pedido + catálogo.
 *
 * Las diferencias se exponen como "incidencias candidatas" — el usuario las
 * confirma o descarta desde la UI, y solo entonces se persisten como
 * `delivery_note_incidents`.
 */
export type AlbaranDiffSeverity = 'info' | 'warn' | 'critical';

export type AlbaranDiffKind =
  | 'price_diff'
  | 'qty_diff'
  | 'unit_diff'
  | 'new_product'
  | 'unmatched_line'
  | 'missing_in_albaran'
  | 'price_spike'
  | 'duplicate_albaran_suspected'
  | 'supplier_mismatch'
  | 'date_suspicious'
  | 'ocr_low_confidence';

export type AlbaranDiff = {
  kind: AlbaranDiffKind;
  severity: AlbaranDiffSeverity;
  message: string;
  /** Referencia opcional a la línea OCR. */
  ocrLineIndex?: number;
  /** Referencia opcional a la línea del pedido vinculada (id del PedidoOrderItem). */
  orderItemId?: string;
  /** Detalles numéricos cuando aplica (delta cantidad, % subida precio, etc.). */
  metrics?: Record<string, number>;
};

export type AlbaranDiffReport = {
  matchedLines: number;
  unmatchedLines: number;
  newProducts: number;
  /** Total absoluto entre `totals.total` del OCR y la suma cantidad×precio del pedido. */
  documentTotalDelta: number | null;
  diffs: AlbaranDiff[];
};

/**
 * Línea del catálogo master usada por el normalizador para decidir cómo comparar.
 * Es un subconjunto deliberado de `PedidoSupplierProduct` — solo lo necesario para
 * el normalizador y el comparador.
 */
export type AlbaranMasterProduct = {
  id: string;
  supplierId: string;
  name: string;
  /** Unidad real con la que el restaurante compra (caja, kg, ud…). */
  purchaseUnit: Unit;
  /** Precio base de catálogo (en `purchaseUnit`). */
  basePrice: number | null;
  /** Último precio recibido validado. */
  lastReceivedPrice: number | null;
  /** Sinónimos / nombres alternativos del proveedor. */
  aliases: string[];
};

export type AlbaranOcrProcessResponse =
  | {
      ok: true;
      payload: AlbaranOcrPayload;
      diff?: AlbaranDiffReport;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      reason?: string;
      hint?: string;
      googleCode?: number | string;
    };
