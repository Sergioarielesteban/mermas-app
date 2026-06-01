/**
 * escandallos-cost-recalculation.ts
 *
 * Fase 3 — Recálculo automático controlado de costes en Escandallos.
 *
 * RESPONSABILIDADES:
 * 1. Marcar recetas como "dirty" cuando cambia un origen de coste.
 * 2. Procesar la cola dirty: recalcular costes y persistir en BD.
 * 3. Recalcular una receta concreta y sus dependientes en cadena.
 * 4. Ordenar recetas para procesar bases antes que los platos que las usan.
 *
 * NO hace:
 * - Cambios de UI / diseño.
 * - Recálculo global sin control.
 * - Modificaciones destructivas de datos existentes.
 * - Auto-trigger: el llamador decide cuándo disparar.
 *
 * FLUJO:
 *
 *   origen cambia
 *     └─► markRecipesCostDirty()     → inserta en escandallo_cost_dirty_queue
 *           └─► recalculateDirtyRecipes()  → lee cola, calcula, persiste
 *
 *   o directamente:
 *     recalculateRecipeAndDependents()
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRawProduct,
  EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import {
  fetchAllEscandalloLinesForLocal,
  fetchEscandalloRecipes,
  fetchEscandalloRawProductsWithWeightedPurchasePrices,
  fetchProcessedProductsForEscandallo,
} from '@/lib/escandallos-supabase';
import type { EscandalloCentralKitchenCatalogItem } from '@/lib/central-kitchen-public-catalog';
import { fetchCentralKitchenPublicCatalog } from '@/lib/central-kitchen-public-catalog';
import type { EscandalloCostSource } from '@/lib/escandallos-affected-recipes';
import { getAffectedRecipesByCostSource } from '@/lib/escandallos-affected-recipes';
import { recalculateRecipeCost } from '@/lib/escandallos-cost-engine';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Contexto con todos los datos necesarios para calcular costes. */
export type CostRecalculationContext = {
  linesByRecipe: Record<string, EscandalloLine[]>;
  recipesById: Map<string, EscandalloRecipe>;
  rawProductById: Map<string, EscandalloRawProduct>;
  processedById: Map<string, EscandalloProcessedProduct>;
  centralKitchenById?: Map<string, EscandalloCentralKitchenCatalogItem>;
};

/** Entrada de la cola de recálculo (DB row → TS). */
export type DirtyQueueEntry = {
  id: string;
  localId: string;
  recipeId: string;
  sourceType: string;
  sourceId: string | null;
  reason: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  recalculatedAt: string | null;
};

type DirtyQueueRow = {
  id: string;
  local_id: string;
  recipe_id: string;
  source_type: string;
  source_id: string | null;
  reason: string | null;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  recalculated_at: string | null;
};

/** Resultado de una operación de recálculo. */
export type RecalculationResult = {
  processed: number;
  errors: number;
  /** IDs de recetas recalculadas exitosamente. */
  succeededIds: string[];
  /** Errores por receta: { recipeId, message }. */
  failedEntries: { recipeId: string; message: string }[];
};

// ─── Helpers internos ─────────────────────────────────────────────────────────

function mapQueueRow(row: DirtyQueueRow): DirtyQueueEntry {
  return {
    id: row.id,
    localId: row.local_id,
    recipeId: row.recipe_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    status: row.status as DirtyQueueEntry['status'],
    attempts: row.attempts,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    recalculatedAt: row.recalculated_at,
  };
}

function sourceLabel(source: EscandalloCostSource): { type: string; id: string | null } {
  switch (source.type) {
    case 'raw':
      return { type: 'raw', id: source.rawSupplierProductId ?? source.articleId ?? null };
    case 'processed':
      return { type: 'processed', id: source.processedProductId };
    case 'subrecipe':
      return { type: 'subrecipe', id: source.recipeId };
    case 'central_kitchen':
      return { type: 'central_kitchen', id: source.centralProductionRecipeId };
  }
}

// ─── Carga de contexto desde Supabase ────────────────────────────────────────

/**
 * Carga todos los datos necesarios para el motor de costes.
 * Costoso (varias queries + PMP 90 días). Llamar una vez y reutilizar.
 */
export async function loadCostRecalculationContext(
  supabase: SupabaseClient,
  localId: string,
): Promise<CostRecalculationContext> {
  const [recipes, linesByRecipe, rawProducts, processedProducts, centralKitchenItems] = await Promise.all([
    fetchEscandalloRecipes(supabase, localId),
    fetchAllEscandalloLinesForLocal(supabase, localId),
    fetchEscandalloRawProductsWithWeightedPurchasePrices(supabase, localId),
    fetchProcessedProductsForEscandallo(supabase, localId),
    fetchCentralKitchenPublicCatalog(supabase, localId).catch(() => [] as EscandalloCentralKitchenCatalogItem[]),
  ]);

  return {
    linesByRecipe,
    recipesById: new Map(recipes.map((r) => [r.id, r])),
    rawProductById: new Map(rawProducts.map((p) => [p.id, p])),
    processedById: new Map(processedProducts.map((p) => [p.id, p])),
    centralKitchenById: new Map(centralKitchenItems.map((ck) => [ck.id, ck])),
  };
}

// ─── Orden de recálculo ───────────────────────────────────────────────────────

/**
 * Ordena recipeIds de forma que las bases/sub-recetas se procesen antes
 * que los platos que las usan. Resiste ciclos.
 *
 * Algoritmo: DFS topológico inverso (Kahn).
 * Si se detecta un ciclo, los nodos cíclicos quedan al final en orden estable.
 */
export function getRecalculationOrder(
  recipeIds: string[],
  linesByRecipe: Record<string, EscandalloLine[]>,
  recipesById: Map<string, EscandalloRecipe>,
): string[] {
  const ids = new Set(recipeIds);
  // Construir grafo de dependencias solo con los nodos del conjunto.
  // dependsOn[A] = conjunto de bases que A usa (A debe procesarse DESPUÉS de ellas)
  const dependsOn = new Map<string, Set<string>>();
  // inDegree = cuántas recetas del conjunto dependen de esta receta
  const inDegree = new Map<string, number>();

  for (const id of ids) {
    dependsOn.set(id, new Set());
    inDegree.set(id, 0);
  }

  for (const id of ids) {
    const lines = linesByRecipe[id] ?? [];
    for (const line of lines) {
      if (line.sourceType === 'subrecipe' && line.subRecipeId && ids.has(line.subRecipeId)) {
        // id depende de line.subRecipeId → line.subRecipeId debe ir primero
        if (!dependsOn.get(id)!.has(line.subRecipeId)) {
          dependsOn.get(id)!.add(line.subRecipeId);
          inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        }
      }
    }
  }

  // Kahn: empezar por los que no dependen de nadie del conjunto (bases hoja)
  const queue: string[] = [];
  for (const id of ids) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  }
  // Orden estable: sub-recetas (is_sub_recipe=true) primero dentro del mismo nivel
  queue.sort((a, b) => {
    const aIsBase = recipesById.get(a)?.isSubRecipe ? 1 : 0;
    const bIsBase = recipesById.get(b)?.isSubRecipe ? 1 : 0;
    return bIsBase - aIsBase; // bases primero
  });

  const result: string[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current)) continue;
    processed.add(current);
    result.push(current);

    // Desbloquear recetas que dependían de current
    for (const id of ids) {
      if (processed.has(id)) continue;
      if (dependsOn.get(id)?.has(current)) {
        const newDegree = (inDegree.get(id) ?? 0) - 1;
        inDegree.set(id, newDegree);
        if (newDegree === 0) queue.push(id);
      }
    }
  }

  // Nodos no alcanzados (ciclo): añadir al final para no perderlos
  for (const id of ids) {
    if (!processed.has(id)) result.push(id);
  }

  return result;
}

// ─── markRecipesCostDirty ─────────────────────────────────────────────────────

export type MarkDirtyParams = {
  localId: string;
  source: EscandalloCostSource;
  reason: string;
  /** Contexto pre-cargado. Si no se pasa, se carga desde Supabase. */
  context?: CostRecalculationContext;
};

export type MarkDirtyResult = {
  markedCount: number;
  recipeIds: string[];
};

/**
 * Detecta recetas afectadas por el origen indicado y las encola como dirty.
 * Deduplica: si ya existe una entrada pending para esa receta, no la duplica.
 */
export async function markRecipesCostDirty(
  supabase: SupabaseClient,
  params: MarkDirtyParams,
): Promise<MarkDirtyResult> {
  const { localId, source, reason } = params;

  // 1. Cargar contexto si no viene pre-cargado
  const ctx =
    params.context ??
    (await (async () => {
      const [recipes, linesByRecipe] = await Promise.all([
        fetchEscandalloRecipes(supabase, localId),
        fetchAllEscandalloLinesForLocal(supabase, localId),
      ]);
      return {
        linesByRecipe,
        recipesById: new Map(recipes.map((r) => [r.id, r])),
        rawProductById: new Map<string, EscandalloRawProduct>(),
        processedById: new Map<string, EscandalloProcessedProduct>(),
      } satisfies CostRecalculationContext;
    })());

  // 2. Detectar recetas afectadas
  const affected = getAffectedRecipesByCostSource({
    source,
    linesByRecipe: ctx.linesByRecipe,
    recipesById: ctx.recipesById,
    processedById: ctx.processedById,
  });

  const allAffected = affected.allRecipeIds;
  if (allAffected.length === 0) return { markedCount: 0, recipeIds: [] };

  // 3. Consultar cuáles ya tienen una entrada pending (para no duplicar)
  const { data: existingPending } = await supabase
    .from('escandallo_cost_dirty_queue')
    .select('recipe_id')
    .eq('local_id', localId)
    .eq('status', 'pending')
    .in('recipe_id', allAffected);

  const alreadyPendingIds = new Set((existingPending ?? []).map((r: { recipe_id: string }) => r.recipe_id));
  const toInsert = allAffected.filter((id) => !alreadyPendingIds.has(id));

  if (toInsert.length === 0) return { markedCount: 0, recipeIds: [] };

  // 4. Insertar en cola
  const { type: srcType, id: srcId } = sourceLabel(source);
  const now = new Date().toISOString();
  const rows = toInsert.map((recipeId) => ({
    local_id: localId,
    recipe_id: recipeId,
    source_type: srcType,
    source_id: srcId,
    reason,
    status: 'pending',
    attempts: 0,
    created_at: now,
  }));

  const { error } = await supabase.from('escandallo_cost_dirty_queue').insert(rows);
  if (error) throw new Error(`markRecipesCostDirty insert error: ${error.message}`);

  return { markedCount: toInsert.length, recipeIds: toInsert };
}

// ─── recalculateDirtyRecipes ──────────────────────────────────────────────────

export type RecalculateDirtyParams = {
  localId: string;
  /** Máximo de recetas a procesar en este lote. Por defecto 50. */
  limit?: number;
  /** Contexto pre-cargado (evita recargar si ya se tiene). */
  context?: CostRecalculationContext;
};

/**
 * Procesa la cola dirty: recalcula costes y persiste cached_cost_eur + cost_cached_at.
 * Procesa bases antes que platos (topological order).
 * Si una receta falla, la marca como error y continúa con las demás.
 */
export async function recalculateDirtyRecipes(
  supabase: SupabaseClient,
  params: RecalculateDirtyParams,
): Promise<RecalculationResult> {
  const { localId, limit = 50 } = params;

  // 1. Leer entradas pending de la cola
  const { data: queueRows, error: queueError } = await supabase
    .from('escandallo_cost_dirty_queue')
    .select('id,local_id,recipe_id,source_type,source_id,reason,status,attempts,error_message,created_at,processed_at,recalculated_at')
    .eq('local_id', localId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queueError) throw new Error(`recalculateDirtyRecipes queue read error: ${queueError.message}`);

  const entries = ((queueRows ?? []) as DirtyQueueRow[]).map(mapQueueRow);
  if (entries.length === 0) return { processed: 0, errors: 0, succeededIds: [], failedEntries: [] };

  // 2. Cargar contexto completo si no viene pre-cargado
  const ctx = params.context ?? (await loadCostRecalculationContext(supabase, localId));

  // 3. Ordenar por topología (bases primero)
  const recipeIds = [...new Set(entries.map((e) => e.recipeId))];
  const orderedIds = getRecalculationOrder(recipeIds, ctx.linesByRecipe, ctx.recipesById);

  // 4. Procesar cada receta en orden
  const result: RecalculationResult = { processed: 0, errors: 0, succeededIds: [], failedEntries: [] };
  const nowIso = new Date().toISOString();

  for (const recipeId of orderedIds) {
    const entry = entries.find((e) => e.recipeId === recipeId);
    if (!entry) continue;

    try {
      await recalculateAndPersistRecipeCost(supabase, localId, recipeId, ctx, nowIso);

      // Marcar como done
      await supabase
        .from('escandallo_cost_dirty_queue')
        .update({ status: 'done', processed_at: nowIso, recalculated_at: nowIso })
        .eq('id', entry.id);

      result.processed++;
      result.succeededIds.push(recipeId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Marcar error, incrementar intentos
      await supabase
        .from('escandallo_cost_dirty_queue')
        .update({
          status: 'error',
          attempts: entry.attempts + 1,
          error_message: message.slice(0, 500),
          processed_at: nowIso,
        })
        .eq('id', entry.id);

      result.errors++;
      result.failedEntries.push({ recipeId, message });
    }
  }

  return result;
}

// ─── recalculateRecipeAndDependents ──────────────────────────────────────────

export type RecalculateOneParams = {
  localId: string;
  recipeId: string;
  reason: string;
  /** Si false (por defecto), también recalcula recetas que dependen de ésta. */
  standalone?: boolean;
  context?: CostRecalculationContext;
};

/**
 * Recalcula una receta concreta y, por defecto, todos sus dependientes directos
 * e indirectos. Útil para disparos síncronos desde la edición de una receta.
 */
export async function recalculateRecipeAndDependents(
  supabase: SupabaseClient,
  params: RecalculateOneParams,
): Promise<RecalculationResult> {
  const { localId, recipeId, reason, standalone = false } = params;
  const ctx = params.context ?? (await loadCostRecalculationContext(supabase, localId));

  // Encontrar recetas dependientes (las que usan ésta como sub-receta)
  const dependentIds = standalone
    ? []
    : findDirectDependents(recipeId, ctx.linesByRecipe);

  const allToProcess = [recipeId, ...dependentIds];
  const orderedIds = getRecalculationOrder(allToProcess, ctx.linesByRecipe, ctx.recipesById);

  const result: RecalculationResult = { processed: 0, errors: 0, succeededIds: [], failedEntries: [] };
  const nowIso = new Date().toISOString();

  for (const id of orderedIds) {
    try {
      await recalculateAndPersistRecipeCost(supabase, localId, id, ctx, nowIso);
      result.processed++;
      result.succeededIds.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors++;
      result.failedEntries.push({ recipeId: id, message });
    }
  }

  // Registrar en la cola como trazabilidad (no como pending — ya está procesado)
  if (result.succeededIds.length > 0) {
    const rows = result.succeededIds.map((id) => ({
      local_id: localId,
      recipe_id: id,
      source_type: 'subrecipe',
      source_id: recipeId,
      reason,
      status: 'done',
      attempts: 1,
      created_at: nowIso,
      processed_at: nowIso,
      recalculated_at: nowIso,
    }));
    // Fire-and-forget: la trazabilidad no debe bloquear el flujo
    void supabase.from('escandallo_cost_dirty_queue').insert(rows);
  }

  return result;
}

// ─── fetchDirtyQueue ──────────────────────────────────────────────────────────

/** Consulta el estado actual de la cola para un local. Útil para debugging. */
export async function fetchDirtyQueueEntries(
  supabase: SupabaseClient,
  localId: string,
  statusFilter?: DirtyQueueEntry['status'],
): Promise<DirtyQueueEntry[]> {
  let query = supabase
    .from('escandallo_cost_dirty_queue')
    .select(
      'id,local_id,recipe_id,source_type,source_id,reason,status,attempts,error_message,created_at,processed_at,recalculated_at',
    )
    .eq('local_id', localId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter) query = query.eq('status', statusFilter);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as DirtyQueueRow[]).map(mapQueueRow);
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

/**
 * Recalcula el coste de una receta usando el motor unificado y persiste
 * cached_cost_eur + cost_cached_at en escandallo_recipes.
 */
async function recalculateAndPersistRecipeCost(
  supabase: SupabaseClient,
  localId: string,
  recipeId: string,
  ctx: CostRecalculationContext,
  nowIso: string,
): Promise<number> {
  const lines = ctx.linesByRecipe[recipeId] ?? [];
  const recipe = ctx.recipesById.get(recipeId);

  const totalCostEur = recalculateRecipeCost({
    lines,
    rawProductById: ctx.rawProductById,
    processedById: ctx.processedById,
    context: recipe
      ? {
          recipeId,
          linesByRecipe: ctx.linesByRecipe,
          recipesById: ctx.recipesById,
          centralKitchenById: ctx.centralKitchenById,
        }
      : undefined,
  });

  const { error } = await supabase
    .from('escandallo_recipes')
    .update({
      cached_cost_eur: Math.round(totalCostEur * 100000) / 100000,
      cost_cached_at: nowIso,
    })
    .eq('id', recipeId)
    .eq('local_id', localId);

  if (error) throw new Error(`persist cost for recipe ${recipeId}: ${error.message}`);
  return totalCostEur;
}

/**
 * Devuelve las IDs de recetas que usan recipeId como sub-receta directa.
 * No resuelve toda la cadena — eso lo hace getAffectedRecipesByCostSource.
 */
function findDirectDependents(
  recipeId: string,
  linesByRecipe: Record<string, EscandalloLine[]>,
): string[] {
  const result: string[] = [];
  for (const [candidate, lines] of Object.entries(linesByRecipe)) {
    if (candidate === recipeId) continue;
    if (lines.some((l) => l.sourceType === 'subrecipe' && l.subRecipeId === recipeId)) {
      result.push(candidate);
    }
  }
  return result;
}
