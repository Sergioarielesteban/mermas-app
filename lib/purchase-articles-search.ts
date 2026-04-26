import type { PurchaseArticle } from '@/lib/purchase-articles-supabase';

const MAX_DEFAULT = 15;

type Tiered = { article: PurchaseArticle; tier: number; name: string };

/**
 * Filtro + orden: coincidencia exacta de nombre, luego empieza por, luego contiene. Máx. `max` resultados.
 */
export function filterPurchaseArticlesByName(
  articles: readonly PurchaseArticle[],
  rawQuery: string,
  max: number = MAX_DEFAULT,
): PurchaseArticle[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const out: Tiered[] = [];
  for (const article of articles) {
    const name = article.nombre.trim().toLowerCase();
    if (name.length === 0) continue;
    let tier: number;
    if (name === q) tier = 0;
    else if (name.startsWith(q)) tier = 1;
    else if (name.includes(q)) tier = 2;
    else continue;
    out.push({ article, tier, name });
  }

  out.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  return out.slice(0, max).map((x) => x.article);
}
