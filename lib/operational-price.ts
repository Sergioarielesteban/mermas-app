export type OperationalPriceSource = 'pmp' | 'ultimo_precio' | 'articulo_master' | 'sin_precio';

function validPrice(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

/**
 * Prioridad de precio operativo:
 * 1) PMP 2) último precio proveedor 3) artículo máster 4) sin precio.
 */
export function resolveOperationalPrice(input: {
  pmpPrice?: number | null;
  supplierLastPrice?: number | null;
  articleMasterPrice?: number | null;
}): { price: number | null; source: OperationalPriceSource } {
  if (validPrice(input.pmpPrice)) return { price: input.pmpPrice, source: 'pmp' };
  if (validPrice(input.supplierLastPrice)) return { price: input.supplierLastPrice, source: 'ultimo_precio' };
  if (validPrice(input.articleMasterPrice)) return { price: input.articleMasterPrice, source: 'articulo_master' };
  return { price: null, source: 'sin_precio' };
}
