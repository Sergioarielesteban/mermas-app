/** Id estable para checklist «solo revisar» sin ítems de producto en BD. */
export function virtualSupplierReviewItemId(supplierId: string): string {
  return `agenda-review-supplier:${supplierId}`;
}
