/**
 * Coste por unidad de uso (cocina) a partir del coste de compra por unidad de envase/formato.
 *
 * @param costeCompraEur € por una unidad de compra (caja, kg, bandeja…)
 * @param unidadesUsoPorUnidadCompra cuántas unidades de uso salen de 1 unidad de compra (p. ej. 50 lonchas / 1 kg → 50 si la compra es 1 kg)
 * @param rendimientoPct % útil 0–100 (100 = sin merma)
 */
export function computeCosteUnitarioUsoEur(
  costeCompraEur: number,
  unidadesUsoPorUnidadCompra: number,
  rendimientoPct: number,
): number | null {
  if (!Number.isFinite(costeCompraEur) || costeCompraEur < 0) return null;
  let u = Number.isFinite(unidadesUsoPorUnidadCompra) && unidadesUsoPorUnidadCompra > 0 ? unidadesUsoPorUnidadCompra : 1;
  let r = Number.isFinite(rendimientoPct) && rendimientoPct > 0 ? rendimientoPct : 100;
  if (r > 100) r = 100;
  const denom = u * (r / 100);
  if (denom <= 0) return null;
  return Math.round((costeCompraEur / denom) * 1e8) / 1e8;
}
