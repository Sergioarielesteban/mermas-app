import type { PedidoSupplier, PedidoSupplierProduct } from '@/lib/pedidos-supabase';

/**
 * MVP: frases tipo «Oye Chef: el bacon ha subido a 7.80» o «bacon 7,5 €».
 * Devuelve trozo de nombre y precio; el emparejado con catálogo es aparte.
 */
export function parseQuickChefPriceText(raw: string): { nameHint: string; price: number } | null {
  const t = raw.trim();
  if (!t) return null;

  const pricePatterns: RegExp[] = [
    /(?:subido\s+a|sube\s+a|ha\s+subido\s+a|bajado\s+a|baja\s+a|a|cuesta|hasta)\s+(\d+[.,]\d{1,2}|\d+)\s*€?/i,
    /(\d+[.,]\d{1,2}|\d+)\s*€\s*$/i,
    /(\d+[.,]\d{1,2}|\d+)\s*$/i,
  ];

  let priceStr: string | null = null;
  let priceMatchIndex = -1;
  for (const re of pricePatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      priceStr = m[1];
      priceMatchIndex = m.index ?? -1;
      break;
    }
  }
  if (!priceStr) return null;
  const price = Number(priceStr.replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) return null;

  let namePart = t
    .replace(/^oye\s*chef\s*[:,\-–—]?\s*/i, '')
    .replace(/^hey\s*chef\s*[:,\-–—]?\s*/i, '')
    .trim();

  if (priceMatchIndex >= 0) {
    const cut = namePart.slice(0, priceMatchIndex).trim();
    if (cut.length > 0) namePart = cut;
  }

  namePart = namePart
    .replace(/\b(el|la|los|las|ha|han|precio|producto)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const nameHint = namePart.replace(/[.:,;]+$/g, '').trim();
  if (nameHint.length < 2) return null;

  return { nameHint, price };
}

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Busca un producto activo cuyo nombre contenga el hint o viceversa (primer mejor score).
 */
export function matchSupplierProductFromHint(
  suppliers: PedidoSupplier[],
  nameHint: string,
  supplierIdFilter?: string,
): { supplier: PedidoSupplier; product: PedidoSupplierProduct } | null {
  const hint = normName(nameHint);
  if (hint.length < 2) return null;

  let best: { supplier: PedidoSupplier; product: PedidoSupplierProduct; score: number } | null = null;

  for (const s of suppliers) {
    if (supplierIdFilter && s.id !== supplierIdFilter) continue;
    for (const p of s.products) {
      const n = normName(p.name);
      if (!n) continue;
      let score = 0;
      if (n === hint) score = 1000 + n.length;
      else if (n.includes(hint)) score = 500 + Math.min(n.length, hint.length);
      else if (hint.includes(n) && n.length >= 3) score = 400 + n.length;
      else {
        const hintWords = hint.split(' ').filter((w) => w.length > 2);
        const hits = hintWords.filter((w) => n.includes(w)).length;
        if (hits > 0) score = 200 + hits * 10;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { supplier: s, product: p, score };
      }
    }
  }
  return best ? { supplier: best.supplier, product: best.product } : null;
}
