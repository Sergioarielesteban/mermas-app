export type Unit = 'kg' | 'ud' | 'bolsa' | 'racion' | 'caja' | 'paquete' | 'bandeja';

export type Product = {
  id: string;
  name: string;
  unit: Unit;
  pricePerUnit: number; // € por unidad
  createdAt: string; // ISO
};

export type MermaMotiveKey =
  | 'se-quemo'
  | 'mal-estado'
  | 'cliente-cambio'
  | 'error-cocina'
  | 'sobras-marcaje'
  | 'cancelado';

export type MermaRecord = {
  id: string;
  productId: string;
  quantity: number;
  motiveKey: MermaMotiveKey;
  notes: string;
  occurredAt: string; // ISO (fecha/hora editable)
  photoDataUrl?: string; // base64 (simulado)
  costEur: number;
  createdAt: string; // ISO
};

