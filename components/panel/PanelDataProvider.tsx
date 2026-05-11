'use client';

import React from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useNotifications } from '@/hooks/useNotifications';
import { useOrderAgendaToday } from '@/hooks/useOrderAgendaToday';
import { usePedidosDataChangedListener } from '@/hooks/usePedidosDataChangedListener';
import {
  appccTemperaturasOperationalDateKey,
  fetchAppccColdUnits,
  fetchAppccReadingsForDate,
  getDueTemperatureRegistrationSlots,
  madridDateKey,
  type AppccSlot,
} from '@/lib/appcc-supabase';
import { fetchAppccFryers, fetchOilEventsForDate } from '@/lib/appcc-aceite-supabase';
import { fetchOrders, type PedidoOrder } from '@/lib/pedidos-supabase';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { canAccessPedidosByRole } from '@/lib/app-role-permissions';
import { getModuleAccess } from '@/lib/canAccessModule';
import type { PlanModule } from '@/lib/planPermissions';
import type { AgendaCutoffRow, AgendaReviewSupplierGroup } from '@/hooks/useOrderAgendaToday';

export type PanelKpi = {
  pedidosHoy: number | null;
  tempDueSlots: AppccSlot[];
  oilFryersActive: number;
  oilHadEventToday: boolean;
  loading: boolean;
};

export type PanelDataContextValue = {
  /** KPI agregados para temperaturas / aceites / pedidos del día. */
  kpi: PanelKpi;
  /** Agenda del día (pedidos obligatorios + revisión diaria). */
  agenda: {
    loading: boolean;
    mandatoryRows: AgendaCutoffRow[];
    reviewSupplierGroups: AgendaReviewSupplierGroup[];
    showAgendaCompletadaMicro: boolean;
    showCard: boolean;
    ymd: string;
    refresh: () => void;
  };
  /** Mensajes de chat / avisos del equipo sin leer (para Chat y Comunicación). */
  chatUnreadCount: number;
  /** Permisos resueltos para los bloques. */
  perms: {
    showPedidos: boolean;
    isBlockedByPlan: (module: PlanModule) => boolean;
  };
  /** localId actual (puede ser null en sesiones sin local resuelto). */
  localId: string | null;
};

const PanelDataContext = React.createContext<PanelDataContextValue | null>(null);

export function PanelDataProvider({ children }: { children: React.ReactNode }) {
  const {
    localCode,
    localName,
    localId,
    email,
    userId,
    profileRole,
    profileReady,
    plan,
  } = useAuth();

  const role = profileRole ?? 'staff';
  const showPedidos = React.useMemo(
    () =>
      canAccessPedidos(localCode, email, localName, localId) && canAccessPedidosByRole(role),
    [localCode, email, localName, localId, role],
  );

  const isBlockedByPlan = React.useCallback(
    (module: PlanModule) => {
      if (!profileReady || !profileRole) return false;
      return !getModuleAccess({ plan, role: profileRole }, module).allowed;
    },
    [plan, profileReady, profileRole],
  );

  const [pedidosOrdersAgenda, setPedidosOrdersAgenda] = React.useState<PedidoOrder[]>([]);
  const [kpi, setKpi] = React.useState<PanelKpi>({
    pedidosHoy: null,
    tempDueSlots: [],
    oilFryersActive: 0,
    oilHadEventToday: false,
    loading: true,
  });

  const agenda = useOrderAgendaToday({
    localId: localId ?? null,
    orders: pedidosOrdersAgenda,
  });

  // Notificaciones del equipo: usamos solo las de tipo `chat_message` para el
  // badge rojo de Comunicación / Chat. Se actualiza en tiempo real vía realtime.
  // El `channelKey` evita colisión con la campanita del AppShell.
  const notifications = useNotifications(localId ?? null, userId ?? null, profileRole, 'panel');
  const chatUnreadCount = React.useMemo(
    () =>
      notifications.items.filter((n) => n.type === 'chat_message' && !n.readAt).length,
    [notifications.items],
  );

  const reloadPedidosOrdersOnly = React.useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb || !localId || !showPedidos) return;
    try {
      const orders = await fetchOrders(sb, localId, { recentDays: 14 });
      setPedidosOrdersAgenda(orders);
    } catch {
      /* silencioso */
    }
  }, [localId, showPedidos]);

  usePedidosDataChangedListener(reloadPedidosOrdersOnly, Boolean(localId && showPedidos));

  React.useEffect(() => {
    if (!localId || !isSupabaseEnabled() || !getSupabaseClient()) {
      setPedidosOrdersAgenda([]);
      setKpi({
        pedidosHoy: null,
        tempDueSlots: [],
        oilFryersActive: 0,
        oilHadEventToday: false,
        loading: false,
      });
      return;
    }
    const sb = getSupabaseClient()!;
    let cancelled = false;
    let firstFetch = true;

    const run = async () => {
      if (firstFetch) {
        setKpi((s) => ({ ...s, loading: true }));
        firstFetch = false;
      }
      const hoyMadrid = madridDateKey();
      let pedidosHoy = 0;
      let tempDueSlots: AppccSlot[] = [];
      let oilFryersActive = 0;
      let oilHadEventToday = false;
      try {
        if (showPedidos) {
          const orders = await fetchOrders(sb, localId, { recentDays: 14 });
          setPedidosOrdersAgenda(orders);
          pedidosHoy = orders.filter((o) => {
            if (o.status !== 'sent') return false;
            const d = (o.deliveryDate?.trim() ?? '').slice(0, 10);
            return d.length >= 10 && d === hoyMadrid;
          }).length;
        } else {
          setPedidosOrdersAgenda([]);
        }
      } catch {
        pedidosHoy = 0;
        setPedidosOrdersAgenda([]);
      }
      try {
        const oilDateKey = madridDateKey();
        const [units, readings, fryers, oilEvents] = await Promise.all([
          fetchAppccColdUnits(sb, localId),
          fetchAppccReadingsForDate(sb, localId, appccTemperaturasOperationalDateKey()),
          fetchAppccFryers(sb, localId),
          fetchOilEventsForDate(sb, localId, oilDateKey),
        ]);
        oilFryersActive = fryers.length;
        oilHadEventToday = oilEvents.length > 0;
        if (units.length > 0) {
          tempDueSlots = getDueTemperatureRegistrationSlots(units, readings);
        }
      } catch {
        tempDueSlots = [];
        oilFryersActive = 0;
        oilHadEventToday = false;
      }
      if (!cancelled) {
        setKpi({ pedidosHoy, tempDueSlots, oilFryersActive, oilHadEventToday, loading: false });
      }
    };

    void run();
    const tick = window.setInterval(() => void run(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [localId, showPedidos]);

  const value = React.useMemo<PanelDataContextValue>(
    () => ({
      kpi,
      agenda,
      chatUnreadCount,
      perms: { showPedidos, isBlockedByPlan },
      localId: localId ?? null,
    }),
    [kpi, agenda, chatUnreadCount, showPedidos, isBlockedByPlan, localId],
  );

  return <PanelDataContext.Provider value={value}>{children}</PanelDataContext.Provider>;
}

export function usePanelData(): PanelDataContextValue {
  const ctx = React.useContext(PanelDataContext);
  if (!ctx) throw new Error('usePanelData debe usarse dentro de PanelDataProvider');
  return ctx;
}
