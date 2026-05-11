'use client';

import Link from 'next/link';
import React from 'react';
import { AlertTriangle, Thermometer } from 'lucide-react';
import { usePanelData } from '@/components/panel/PanelDataProvider';
import type { PanelBlockId } from '@/lib/panel/panel-blocks';

/**
 * Sistema de alertas críticas SIEMPRE-VISIBLES.
 *
 * Aunque el usuario oculte bloques desde "Personalizar panel", estas alertas
 * siguen apareciendo arriba para que nada operativo se pierda. Hoy cubrimos:
 *  - temperatura pendiente (mañana/noche)
 *  - pedido obligatorio sin enviar
 *
 * Si el bloque rico correspondiente está visible y ya transmite la urgencia
 * (p. ej. la tarjeta "Pedidos del día" con sus obligatorios), se omite el
 * banner para no duplicar la información. Cuando el usuario lo oculta, el
 * banner reaparece como red de seguridad.
 *
 * Futuras (TODO): checklist de cierre pendiente, incidencia crítica APPCC.
 */
export default function PanelCriticalAlerts({
  visibleBlockIds,
}: {
  /** IDs visibles en la zona configurable; sirve para evitar duplicidad. */
  visibleBlockIds: readonly PanelBlockId[];
}) {
  const { kpi, agenda, perms } = usePanelData();
  const visibleSet = React.useMemo(() => new Set(visibleBlockIds), [visibleBlockIds]);

  const tempUrgent = kpi.tempDueSlots.includes('noche');
  const tempPending = kpi.tempDueSlots.length > 0;

  // `mandatoryRows` ya viene filtrado para excluir los obligatorios omitidos o
  // enviados. Si quedan filas, hay pedidos obligatorios pendientes hoy.
  const pendingMandatoryCount = agenda.mandatoryRows.length;
  const pedidoObligatorioPendiente =
    perms.showPedidos && !perms.isBlockedByPlan('pedidos') && pendingMandatoryCount > 0;

  type CriticalAlert = {
    id: string;
    text: string;
    href: string;
    urgent: boolean;
    Icon: React.ComponentType<{ className?: string }>;
  };

  const alerts: CriticalAlert[] = [];
  // La tarjeta "Temperaturas" del panel ya marca el badge PEND., pero un
  // recordatorio claro arriba ayuda mucho en cocina. Si el bloque visible la
  // muestra ya, suprimimos el banner para no duplicar.
  if (tempPending && !visibleSet.has('temperaturas')) {
    alerts.push({
      id: 'temperatura',
      text: tempUrgent
        ? 'Temperatura de la noche sin registrar'
        : 'Temperatura de la mañana sin registrar',
      href: '/appcc/temperaturas',
      urgent: tempUrgent,
      Icon: Thermometer,
    });
  }
  // Suprimimos el banner si la tarjeta de agenda ya está visible (ahí se ven
  // los pedidos obligatorios con su acordeón).
  if (pedidoObligatorioPendiente && !visibleSet.has('pedidos-agenda')) {
    alerts.push({
      id: 'pedido-obligatorio',
      text:
        pendingMandatoryCount === 1
          ? 'Pedido obligatorio sin enviar'
          : `${pendingMandatoryCount} pedidos obligatorios sin enviar`,
      href: '/pedidos',
      urgent: true,
      Icon: AlertTriangle,
    });
  }

  if (alerts.length === 0) return null;

  return (
    <section
      id="panel-alertas-criticas"
      className="scroll-mt-28"
      aria-label="Alertas críticas"
    >
      <ul className="flex flex-col gap-1.5">
        {alerts.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className={[
                'flex min-h-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left ring-1 transition-transform active:scale-[0.99]',
                a.urgent ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1',
                  a.urgent
                    ? 'bg-white text-red-600 ring-red-100'
                    : 'bg-white text-amber-600 ring-amber-100',
                ].join(' ')}
              >
                <a.Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <p
                className={[
                  'flex-1 text-[12px] font-semibold leading-snug',
                  a.urgent ? 'text-red-700' : 'text-amber-800',
                ].join(' ')}
              >
                {a.text}
              </p>
              <span
                className={[
                  'shrink-0 text-[11px] font-bold',
                  a.urgent ? 'text-red-500' : 'text-amber-500',
                ].join(' ')}
                aria-hidden
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
