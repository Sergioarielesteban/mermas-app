'use client';

import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  CATEGORY_LABELS,
  DEFAULT_PANEL_ORDER,
  PANEL_BLOCKS,
  PANEL_BLOCK_BY_ID,
  PANEL_PRESET_BY_ID,
  type PanelBlockCategory,
  type PanelBlockId,
  type PanelBlockMeta,
  type PanelPresetId,
} from '@/lib/panel/panel-blocks';
import {
  buildDefaultPanelConfig,
  loadPanelConfig,
  savePanelConfig,
  type PanelConfig,
} from '@/lib/panel/panel-config-storage';
import {
  canAccessChat,
  canAccessComidaPersonal,
  canAccessEscandallos,
  canAccessFinanzas,
  canAccessInventario,
  canAccessPedidosByRole,
} from '@/lib/app-role-permissions';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { getModuleAccess } from '@/lib/canAccessModule';

/**
 * Estado de configuración del panel + permisos resueltos.
 *
 * Expone:
 *  - `visibleBlocks`: bloques que el usuario quiere ver, ordenados (favoritos
 *    primero, luego según `order`, respetando bloques críticos siempre arriba).
 *  - `availableBlocks`: catálogo filtrado por permisos (lo que tiene sentido
 *    ofrecer al usuario en el sheet de personalización).
 *  - Métodos para reordenar, ocultar, marcar favoritos, aplicar presets, etc.
 */
export type UsePanelConfigResult = {
  config: PanelConfig;
  /** IDs visibles en orden final (favoritos arriba, luego `order`, críticos siempre incluidos). */
  visibleBlockIds: PanelBlockId[];
  /** Bloques con metadatos, ya filtrados por permisos. Para el sheet. */
  availableBlocks: PanelBlockMeta[];
  /** Agrupación por categoría (en orden estable Operativa → Control → Gestión → Personal). */
  availableByCategory: Array<{
    category: PanelBlockCategory;
    label: string;
    items: PanelBlockMeta[];
  }>;
  isFavorite: (id: PanelBlockId) => boolean;
  isHidden: (id: PanelBlockId) => boolean;
  isCritical: (id: PanelBlockId) => boolean;
  setOrder: (next: PanelBlockId[]) => void;
  toggleHidden: (id: PanelBlockId) => void;
  toggleFavorite: (id: PanelBlockId) => void;
  applyPreset: (presetId: PanelPresetId) => void;
  resetDefaults: () => void;
  /** Persistir manualmente (los setters anteriores ya persisten). */
  save: (next: PanelConfig) => void;
};

const CATEGORY_ORDER: PanelBlockCategory[] = ['operativa', 'control', 'gestion', 'personal'];

function buildOrderedVisible(
  config: PanelConfig,
  available: PanelBlockMeta[],
): PanelBlockId[] {
  const availableIds = new Set(available.map((b) => b.id));
  const hidden = new Set(config.hidden);
  const favorites = config.favorites.filter((id) => availableIds.has(id));
  const order = config.order.filter((id) => availableIds.has(id));

  // Bloques disponibles que no están en `order` pero están enabled por defecto:
  // se añaden al final si no están ocultos.
  const remainingDefaults = available
    .filter((b) => b.defaultEnabled && !order.includes(b.id) && !favorites.includes(b.id))
    .map((b) => b.id);

  // 1) Construcción base: favoritos → orden del usuario → defaults restantes.
  const seen = new Set<PanelBlockId>();
  const base: PanelBlockId[] = [];
  const push = (id: PanelBlockId) => {
    if (seen.has(id)) return;
    seen.add(id);
    base.push(id);
  };
  favorites.forEach(push);
  order.forEach(push);
  remainingDefaults.forEach(push);

  // 2) Filtrado por ocultos (los críticos NUNCA se ocultan).
  const visibleBase = base.filter((id) => {
    const meta = PANEL_BLOCK_BY_ID[id];
    if (meta?.critical) return true;
    return !hidden.has(id);
  });

  // 3) Garantizamos que TODOS los bloques críticos disponibles aparezcan,
  //    aunque el usuario no los tenga en `order` (p. ej. tras aplicar un preset).
  for (const meta of available) {
    if (!meta.critical) continue;
    if (visibleBase.includes(meta.id)) continue;
    visibleBase.push(meta.id);
  }

  // 4) Críticos primero (respetan su orden relativo), luego el resto.
  //    Así "los favoritos arriba" se cumple para los bloques no críticos.
  const criticals: PanelBlockId[] = [];
  const rest: PanelBlockId[] = [];
  for (const id of visibleBase) {
    if (PANEL_BLOCK_BY_ID[id]?.critical) criticals.push(id);
    else rest.push(id);
  }
  return [...criticals, ...rest];
}

export function usePanelConfig(): UsePanelConfigResult {
  const auth = useAuth();
  const { localId, userId } = auth;

  const [config, setConfig] = React.useState<PanelConfig>(() => buildDefaultPanelConfig());
  const [hydrated, setHydrated] = React.useState(false);

  // Hidrata desde localStorage en cliente (evita mismatch SSR).
  React.useEffect(() => {
    setConfig(loadPanelConfig(localId, userId));
    setHydrated(true);
  }, [localId, userId]);

  // Sincronización entre pestañas / componentes.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChanged = () => setConfig(loadPanelConfig(localId, userId));
    window.addEventListener('chef-one:panel-config-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => {
      window.removeEventListener('chef-one:panel-config-changed', onChanged);
      window.removeEventListener('storage', onChanged);
    };
  }, [localId, userId]);

  const persist = React.useCallback(
    (next: PanelConfig) => {
      setConfig(next);
      if (hydrated) savePanelConfig(localId, userId, next);
    },
    [hydrated, localId, userId],
  );

  // Permisos y filtrado del catálogo disponible para este usuario.
  const availableBlocks = React.useMemo<PanelBlockMeta[]>(() => {
    const role = auth.profileRole ?? 'staff';
    const plan = auth.plan;
    const profileReady = auth.profileReady;

    const planAllows = (module: PanelBlockMeta['requiresPlanModule']) => {
      if (!module) return true;
      if (!profileReady || !auth.profileRole) return true; // mientras carga, no escondemos
      return getModuleAccess({ plan, role: auth.profileRole }, module).allowed;
    };

    const permissionAllows = (perm: PanelBlockMeta['requiresPermission']) => {
      switch (perm) {
        case 'pedidos':
          return (
            canAccessPedidos(auth.localCode, auth.email, auth.localName, auth.localId) &&
            canAccessPedidosByRole(role)
          );
        case 'finanzas':
          return canAccessFinanzas(role);
        case 'inventario':
          return canAccessInventario(role);
        case 'escandallos':
          return canAccessEscandallos(role);
        case 'chat':
          return canAccessChat(role);
        case 'comida-personal':
          return canAccessComidaPersonal(role);
        case undefined:
        default:
          return true;
      }
    };

    return PANEL_BLOCKS.filter(
      (b) => planAllows(b.requiresPlanModule) && permissionAllows(b.requiresPermission),
    );
  }, [
    auth.email,
    auth.localCode,
    auth.localId,
    auth.localName,
    auth.plan,
    auth.profileReady,
    auth.profileRole,
  ]);

  const availableByCategory = React.useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABELS[category],
        items: availableBlocks.filter((b) => b.category === category),
      })).filter((c) => c.items.length > 0),
    [availableBlocks],
  );

  const visibleBlockIds = React.useMemo(
    () => buildOrderedVisible(config, availableBlocks),
    [config, availableBlocks],
  );

  const isFavorite = React.useCallback(
    (id: PanelBlockId) => config.favorites.includes(id),
    [config.favorites],
  );
  const isHidden = React.useCallback(
    (id: PanelBlockId) => config.hidden.includes(id),
    [config.hidden],
  );
  const isCritical = React.useCallback(
    (id: PanelBlockId) => Boolean(PANEL_BLOCK_BY_ID[id]?.critical),
    [],
  );

  const setOrder = React.useCallback(
    (next: PanelBlockId[]) => {
      const cleaned = next.filter((id) => id in PANEL_BLOCK_BY_ID);
      persist({ ...config, order: cleaned, preset: null });
    },
    [config, persist],
  );

  const toggleHidden = React.useCallback(
    (id: PanelBlockId) => {
      if (PANEL_BLOCK_BY_ID[id]?.critical) return;
      const has = config.hidden.includes(id);
      const hidden = has ? config.hidden.filter((x) => x !== id) : [...config.hidden, id];
      // Si lo ocultamos, lo retiramos también de favoritos.
      const favorites = has ? config.favorites : config.favorites.filter((x) => x !== id);
      // Si lo activamos y no estaba en `order`, lo añadimos al final.
      const order = has && !config.order.includes(id) ? [...config.order, id] : config.order;
      persist({ ...config, hidden, favorites, order, preset: null });
    },
    [config, persist],
  );

  const toggleFavorite = React.useCallback(
    (id: PanelBlockId) => {
      const has = config.favorites.includes(id);
      const favorites = has ? config.favorites.filter((x) => x !== id) : [...config.favorites, id];
      // Si lo marcamos favorito, asegúrate de que esté visible y en `order`.
      const hidden = has ? config.hidden : config.hidden.filter((x) => x !== id);
      const order = has || config.order.includes(id) ? config.order : [...config.order, id];
      persist({ ...config, favorites, hidden, order, preset: null });
    },
    [config, persist],
  );

  const applyPreset = React.useCallback(
    (presetId: PanelPresetId) => {
      const preset = PANEL_PRESET_BY_ID[presetId];
      if (!preset) return;
      const order = preset.order.filter((id) => id in PANEL_BLOCK_BY_ID);
      const favorites = preset.favorites.filter((id) => id in PANEL_BLOCK_BY_ID);
      // Hidden = todo lo disponible que no esté en `order` y no sea crítico.
      const orderSet = new Set(order);
      const hidden = availableBlocks
        .filter((b) => !orderSet.has(b.id) && !b.critical)
        .map((b) => b.id);
      persist({
        version: config.version,
        order,
        favorites,
        hidden,
        preset: presetId,
        updatedAt: new Date().toISOString(),
      });
    },
    [availableBlocks, config.version, persist],
  );

  const resetDefaults = React.useCallback(() => {
    persist({
      version: config.version,
      order: [...DEFAULT_PANEL_ORDER],
      favorites: [],
      hidden: [],
      preset: null,
      updatedAt: new Date().toISOString(),
    });
  }, [config.version, persist]);

  return {
    config,
    visibleBlockIds,
    availableBlocks,
    availableByCategory,
    isFavorite,
    isHidden,
    isCritical,
    setOrder,
    toggleHidden,
    toggleFavorite,
    applyPreset,
    resetDefaults,
    save: persist,
  };
}
