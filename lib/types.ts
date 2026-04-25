/**
 * Unidad de **pedido** (proveedor) y, en muchas líneas, la unidad almacenada en pedidos.
 * Incluye unidades comerciales (docena, caja) distintas de la unidad de uso interna en recetas,
 * que se relaciona vía `unitsPerPack` + `recipeUnit` en catálogo.
 */
export type Unit =
  | 'kg'
  | 'ud'
  | 'bolsa'
  | 'racion'
  | 'caja'
  | 'paquete'
  | 'bandeja'
  | 'docena'
  | 'litro'
  | 'ml'
  | 'g';

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
  | 'cancelado'
  | 'otros-motivos';

export type MermaShift = 'manana' | 'tarde';

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
  /** Opcional: turno declarado al registrar (no obligatorio). */
  shift?: MermaShift | null;
  /** Opcional: etiqueta libre (quién registra, etc.). */
  optionalUserLabel?: string;
};

