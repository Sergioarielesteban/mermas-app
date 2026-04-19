/**
 * Contrato estable de salida OCR (independiente del proveedor AWS/Google/Azure/…).
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
  /** Identificador lógico (p. ej. textract, google_vision). */
  provider: string;
  rawText?: string;
  supplierHint?: string | null;
  documentDate?: string | null;
  invoiceNumber?: string | null;
  items: NormalizedOcrItem[];
  totals?: NormalizedOcrTotals;
  warnings?: string[];
};
