/**
 * escandallos-affected-recipes.ts
 *
 * Detecta qué recetas y bases se ven afectadas cuando cambia el coste de
 * cualquier origen: crudo, artículo master, elaboración, base, plato de
 * Cocina Central.
 *
 * Es PURO: no hace queries, no recalcula, no modifica nada. Trabaja
 * únicamente con las estructuras ya cargadas en memoria.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * MODELO DE DEPENDENCIAS
 *
 *   raw / article / processed   →  líneas de tipo 'raw' / 'processed'
 *   base (is_sub_recipe=true)   →  líneas de tipo 'subrecipe'
 *   central_kitchen             →  líneas de tipo 'central_kitchen'
 *   manual                      →  sin dependencia de precio externo
 *
 * Cadena transitiva:
 *   crudo → base A → base B → plato
 *   crudo → elaboración → plato
 *   central_kitchen → plato
 * ──────────────────────────────────────────────────────────────────────────
 */

import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRecipe,
} from '@/lib/escandallos-supabase';

// ─── Tipos públicos ────────────────────────────────────────────────────────

/**
 * Origen de coste normalizado. Cualquier entrada del sistema puede
 * reducirse a una de estas variantes antes de resolver dependencias.
 */
export type EscandalloCostSource =
  | {
      type: 'raw';
      /** ID en `pedido_supplier_products`. Puede ser null si se identifica por articleId. */
      rawSupplierProductId?: string | null;
      /** ID en `purchase_articles`. Puede ser null si se identifica por rawSupplierProductId. */
      articleId?: string | null;
      /** ID de formato operativo en `article_usage_formats`. Coincidencia adicional opcional. */
      usageFormatId?: string | null;
    }
  | { type: 'processed'; processedProductId: string }
  | { type: 'subrecipe'; recipeId: string }
  | { type: 'central_kitchen'; centralProductionRecipeId: string };

/** Nodo del árbol de dependencias con trazabilidad completa. */
export type DependencyNode = {
  /** ID de la receta afectada en este nodo. */
  recipeId: string;
  /** Nombre de la receta afectada (si se pasa recipesById). */
  recipeName: string;
  /** Profundidad desde el origen (0 = directa). */
  depth: number;
  /**
   * Ruta de IDs desde el origen hasta este nodo.
   * El primer elemento es el ID del origen (p.ej. rawSupplierProductId).
   * El último es recipeId.
   */
  path: string[];
  /** Si true, esta receta es base/elaboración (is_sub_recipe=true). */
  isBase: boolean;
};

/** Resultado completo de getAffectedRecipesByCostSource. */
export type AffectedEscandalloRecipes = {
  /** Recetas que usan el origen directamente en sus líneas. */
  directRecipes: DependencyNode[];
  /** Recetas que usan el origen de forma transitiva (vía bases u otras recetas). */
  indirectRecipes: DependencyNode[];
  /** Bases/sub-recetas directamente afectadas (usadas como origen o que lo contienen). */
  affectedBases: string[];
  /** IDs de elaboraciones (processed products) directamente implicadas. */
  affectedElaborations: string[];
  /** IDs de productos de Cocina Central directamente implicados. */
  affectedCentralKitchenProducts: string[];
  /** Árbol completo de dependencias, ordenado por profundidad. */
  dependencyTree: DependencyNode[];
  /** Número total de recetas afectadas (directas + indirectas, sin duplicados). */
  totalAffectedCount: number;
  /** @deprecated Usa directRecipes/indirectRecipes. Mantenido por compatibilidad. */
  directRecipeIds: string[];
  /** @deprecated Usa directRecipes/indirectRecipes. Mantenido por compatibilidad. */
  indirectRecipeIds: string[];
  /** @deprecated Usa dependencyTree. Mantenido por compatibilidad. */
  allRecipeIds: string[];
};

// ─── Parámetros de entrada ─────────────────────────────────────────────────

export type AffectedRecipesInput = {
  source: EscandalloCostSource;
  /** Todas las líneas agrupadas por recipeId. */
  linesByRecipe: Record<string, EscandalloLine[]>;
  /** Metadatos de recetas (para saber si es base y obtener nombre). */
  recipesById?: Map<string, EscandalloRecipe>;
  /**
   * Elaboraciones cargadas (para propagar cuando un processed product
   * usa el mismo raw que el origen).
   */
  processedById?: Map<string, EscandalloProcessedProduct>;
};

// ─── Helpers internos ─────────────────────────────────────────────────────

/**
 * Normaliza el origen: acepta campos sueltos y construye un
 * EscandalloCostSource bien tipado. Útil cuando se llama desde
 * eventos de UI con datos parciales.
 */
export function normalizeCostSource(params: {
  rawSupplierProductId?: string | null;
  articleId?: string | null;
  usageFormatId?: string | null;
  processedProductId?: string | null;
  subRecipeId?: string | null;
  centralProductionRecipeId?: string | null;
}): EscandalloCostSource | null {
  if (params.centralProductionRecipeId) {
    return { type: 'central_kitchen', centralProductionRecipeId: params.centralProductionRecipeId };
  }
  if (params.subRecipeId) {
    return { type: 'subrecipe', recipeId: params.subRecipeId };
  }
  if (params.processedProductId) {
    return { type: 'processed', processedProductId: params.processedProductId };
  }
  if (params.rawSupplierProductId || params.articleId || params.usageFormatId) {
    return {
      type: 'raw',
      rawSupplierProductId: params.rawSupplierProductId ?? null,
      articleId: params.articleId ?? null,
      usageFormatId: params.usageFormatId ?? null,
    };
  }
  return null;
}

/**
 * Comprueba si una línea de escandallo coincide con un origen de coste.
 * Para 'raw': acepta match por rawSupplierProductId, articleId o usageFormatId
 * (cualquiera que esté presente en el origen y en la línea).
 */
export function lineMatchesSource(line: EscandalloLine, source: EscandalloCostSource): boolean {
  switch (source.type) {
    case 'raw': {
      if (line.sourceType !== 'raw') return false;
      const byProduct =
        source.rawSupplierProductId != null &&
        line.rawSupplierProductId === source.rawSupplierProductId;
      const byArticle =
        source.articleId != null &&
        line.articleId != null &&
        line.articleId === source.articleId;
      const byFormat =
        source.usageFormatId != null &&
        (line as { usageFormatId?: string | null }).usageFormatId === source.usageFormatId;
      return byProduct || byArticle || byFormat;
    }
    case 'processed':
      return (
        line.sourceType === 'processed' &&
        line.processedProductId === source.processedProductId
      );
    case 'subrecipe':
      return line.sourceType === 'subrecipe' && line.subRecipeId === source.recipeId;
    case 'central_kitchen':
      return (
        line.sourceType === 'central_kitchen' &&
        line.centralProductionRecipeId === source.centralProductionRecipeId
      );
  }
}

/**
 * Devuelve las IDs de elaboraciones (processed products) que usan el mismo
 * rawSupplierProductId o articleId que el origen. Estas elaboraciones se
 * consideran indirectamente afectadas y sus usos en recetas se propagan.
 */
function getAffectedProcessedIds(
  source: EscandalloCostSource,
  processedById: Map<string, EscandalloProcessedProduct>,
): string[] {
  if (source.type !== 'raw') return [];
  const affected: string[] = [];
  for (const [id, p] of processedById) {
    // EscandalloProcessedProduct usa sourceSupplierProductId para el crudo de origen.
    if (
      source.rawSupplierProductId != null &&
      p.sourceSupplierProductId === source.rawSupplierProductId
    ) {
      affected.push(id);
    }
  }
  return affected;
}

/** Elimina nodos duplicados por recipeId, conservando el de menor profundidad. */
export function dedupeAffectedRecipes(nodes: DependencyNode[]): DependencyNode[] {
  const byId = new Map<string, DependencyNode>();
  for (const node of nodes) {
    const existing = byId.get(node.recipeId);
    if (!existing || node.depth < existing.depth) {
      byId.set(node.recipeId, node);
    }
  }
  return [...byId.values()].sort((a, b) => a.depth - b.depth || a.recipeName.localeCompare(b.recipeName));
}

// ─── Función principal ─────────────────────────────────────────────────────

/**
 * Devuelve todas las recetas afectadas por un origen de coste,
 * con trazabilidad completa y detección de ciclos.
 *
 * No hace llamadas a red. Puro y testeable.
 *
 * @example
 * const result = getAffectedRecipesByCostSource({
 *   source: { type: 'raw', rawSupplierProductId: 'uuid-tomate' },
 *   linesByRecipe,
 *   recipesById,
 *   processedById,
 * });
 * // result.directRecipes  → recetas que usan el tomate directamente
 * // result.indirectRecipes → platos que lo usan vía base
 * // result.dependencyTree  → árbol Tomate → Salsa tomate → Lasaña
 */
export function getAffectedRecipesByCostSource({
  source,
  linesByRecipe,
  recipesById = new Map(),
  processedById = new Map(),
}: AffectedRecipesInput): AffectedEscandalloRecipes {
  // ── 1. Elaboraciones afectadas por el origen raw ──────────────────────
  const affectedElaborations = getAffectedProcessedIds(source, processedById);

  // ── 2. Recetas con uso DIRECTO del origen (incluyendo via elaboraciones) ─
  const directNodes: DependencyNode[] = [];
  const directIds = new Set<string>();

  for (const [recipeId, lines] of Object.entries(linesByRecipe)) {
    const usesSourceDirectly = lines.some((line) => lineMatchesSource(line, source));

    // También es "directa" si usa una elaboración afectada.
    const usesAffectedProcessed =
      affectedElaborations.length > 0 &&
      lines.some(
        (line) =>
          line.sourceType === 'processed' &&
          line.processedProductId != null &&
          affectedElaborations.includes(line.processedProductId),
      );

    if (usesSourceDirectly || usesAffectedProcessed) {
      const recipe = recipesById.get(recipeId);
      directIds.add(recipeId);
      directNodes.push({
        recipeId,
        recipeName: recipe?.name ?? recipeId,
        depth: 0,
        path: [sourceLabel(source), recipeId],
        isBase: recipe?.isSubRecipe ?? false,
      });
    }
  }

  // ── 3. Propagación transitiva: recetas que usan bases afectadas ───────
  // BFS con protección contra ciclos (visited = recetas ya procesadas).
  const allNodes: DependencyNode[] = [...directNodes];
  // Si el origen ES una receta/base, marcarlo como visitado desde el inicio
  // para que nunca se redescubra como "indirecto" cerrando el ciclo.
  const sourceRecipeId = source.type === 'subrecipe' ? source.recipeId : null;
  const visited = new Set<string>([...directIds, ...(sourceRecipeId ? [sourceRecipeId] : [])]);

  // Cola: [recipeId afectada, profundidad, path hasta aquí]
  type QueueItem = { recipeId: string; depth: number; path: string[] };
  const queue: QueueItem[] = directNodes.map((n) => ({
    recipeId: n.recipeId,
    depth: 0,
    path: n.path,
  }));

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const [candidateId, lines] of Object.entries(linesByRecipe)) {
      if (visited.has(candidateId)) continue;

      // ¿Usa como sub-receta una de las recetas afectadas?
      const usesAffected = lines.some(
        (line) => line.sourceType === 'subrecipe' && line.subRecipeId === current.recipeId,
      );

      if (usesAffected) {
        visited.add(candidateId);
        const recipe = recipesById.get(candidateId);
        const newPath = [...current.path, candidateId];
        const node: DependencyNode = {
          recipeId: candidateId,
          recipeName: recipe?.name ?? candidateId,
          depth: current.depth + 1,
          path: newPath,
          isBase: recipe?.isSubRecipe ?? false,
        };
        allNodes.push(node);
        queue.push({ recipeId: candidateId, depth: current.depth + 1, path: newPath });
      }
    }
  }

  // ── 4. Clasificar y construir respuesta ───────────────────────────────
  const deduped = dedupeAffectedRecipes(allNodes);
  const direct = deduped.filter((n) => n.depth === 0);
  const indirect = deduped.filter((n) => n.depth > 0);
  const affectedBases = deduped.filter((n) => n.isBase).map((n) => n.recipeId);
  const affectedCentralKitchenProducts =
    source.type === 'central_kitchen' ? [source.centralProductionRecipeId] : [];

  return {
    directRecipes: direct,
    indirectRecipes: indirect,
    affectedBases,
    affectedElaborations,
    affectedCentralKitchenProducts,
    dependencyTree: deduped,
    totalAffectedCount: deduped.length,
    // compatibilidad backward
    directRecipeIds: direct.map((n) => n.recipeId).sort(),
    indirectRecipeIds: indirect.map((n) => n.recipeId).sort(),
    allRecipeIds: deduped.map((n) => n.recipeId).sort(),
  };
}

// ─── Sub-funciones exportadas individualmente ──────────────────────────────

/**
 * Devuelve los recipeIds que tienen una línea directa con el origen.
 * Versión ligera sin árbol, útil para invalidaciones rápidas de caché.
 */
export function getDirectRecipeUsages(
  source: EscandalloCostSource,
  linesByRecipe: Record<string, EscandalloLine[]>,
): string[] {
  const result: string[] = [];
  for (const [recipeId, lines] of Object.entries(linesByRecipe)) {
    if (lines.some((line) => lineMatchesSource(line, source))) result.push(recipeId);
  }
  return result.sort();
}

/**
 * Devuelve recipeIds que usan el origen de forma indirecta
 * (a través de bases u otras sub-recetas encadenadas).
 */
export function getIndirectRecipeUsages(
  directIds: string[],
  linesByRecipe: Record<string, EscandalloLine[]>,
): string[] {
  const affected = new Set(directIds);
  const visited = new Set(directIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const [recipeId, lines] of Object.entries(linesByRecipe)) {
      if (visited.has(recipeId)) continue;
      if (
        lines.some(
          (line) => line.sourceType === 'subrecipe' && line.subRecipeId && affected.has(line.subRecipeId),
        )
      ) {
        affected.add(recipeId);
        visited.add(recipeId);
        changed = true;
      }
    }
  }

  return [...affected].filter((id) => !directIds.includes(id)).sort();
}

/**
 * Construye el árbol de dependencias legible como array de rutas.
 * Cada entrada es la cadena "Origen → Base A → Plato B".
 */
export function getDependencyTree(
  result: AffectedEscandalloRecipes,
  recipesById?: Map<string, EscandalloRecipe>,
): string[] {
  return result.dependencyTree.map((node) => {
    const pathLabels = node.path.map((id) => {
      const recipe = recipesById?.get(id);
      return recipe?.name ?? id;
    });
    return pathLabels.join(' → ');
  });
}

// ─── Helper interno ───────────────────────────────────────────────────────

function sourceLabel(source: EscandalloCostSource): string {
  switch (source.type) {
    case 'raw':
      return source.rawSupplierProductId ?? source.articleId ?? 'raw';
    case 'processed':
      return source.processedProductId;
    case 'subrecipe':
      return source.recipeId;
    case 'central_kitchen':
      return source.centralProductionRecipeId;
  }
}
