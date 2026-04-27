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
  pricePerUnit: number; // € por unidad (coste operativo efectivo)
  typeOrigin?: 'manual' | 'master' | 'escandallo' | 'base_subreceta' | 'composicion';
  masterArticleId?: string | null;
  escandalloId?: string | null;
  baseSubrecipeId?: string | null;
  baseSubrecipeKind?: 'recipe' | 'processed' | null;
  manualPricePerUnit?: number | null;
  compositionLines?: Array<{
    id: string;
    componentType: 'master' | 'escandallo' | 'base_subreceta';
    componentId: string;
    componentKind?: 'recipe' | 'processed' | null;
    qty: number;
    unit: string;
  }>;
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
  /** Snapshot del origen y coste al registrar (histórico inmutable). */
  originTypeUsed?: 'manual' | 'master' | 'escandallo' | 'base_subreceta' | 'composicion' | 'sin_precio';
  unitCostSnapshot?: number | null;
  totalCostSnapshot?: number | null;
  compositionSnapshot?: Array<{
    componentType: 'master' | 'escandallo' | 'base_subreceta';
    componentId: string;
    componentKind?: 'recipe' | 'processed' | null;
    qty: number;
    unit: string;
    unitCost: number;
    lineCost: number;
  }>;
};

