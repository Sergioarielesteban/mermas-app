/**
 * Contrato estable de salida OCR (Document AI).
 */
export type NormalizedOcrItem = {
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  unit?: string | null;
};

export type NormalizedOcrTotals = {
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
};

export type NormalizedOCRResult = {
  /** Identificador lógico (p. ej. document-ai). */
  provider: string;
  rawText?: string;
  supplierHint?: string | null;
  documentDate?: string | null;
  invoiceNumber?: string | null;
  items: NormalizedOcrItem[];
  totals?: NormalizedOcrTotals;
  warnings?: string[];
};
