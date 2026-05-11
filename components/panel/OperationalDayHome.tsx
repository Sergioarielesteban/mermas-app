'use client';

/**
 * Orquestador del Panel de Control de Chef One.
 *
 * Antes era un componente "monolítico" con la secuencia fija de bloques.
 * Ahora actúa como un **dashboard configurable**:
 *
 *  1. `PanelDataProvider` hace UNA sola tirada de datos (KPI + agenda) por
 *     minuto y la comparte vía context con todos los bloques.
 *  2. `<PanelGreetingBlock />` y `<PanelCriticalAlerts />` se renderizan
 *     siempre arriba (saludo + alertas críticas no ocultables).
 *  3. `usePanelConfig` calcula la lista de bloques visibles en su orden
 *     final (favoritos arriba, luego `order`, críticos siempre dentro).
 *  4. Para cada id, montamos su renderer desde `PANEL_BLOCK_RENDERERS`.
 *  5. Al pie, botón "Personalizar panel" que abre el bottom-sheet.
 *
 * La configuración se guarda en `localStorage` y queda preparada para
 * sincronizarse en Supabase en una segunda fase.
 */

import React from 'react';
import ProductoGuiadoChecklist from '@/components/ProductoGuiadoChecklist';
import PanelCriticalAlerts from '@/components/panel/PanelCriticalAlerts';
import PanelCustomizeButton from '@/components/panel/PanelCustomizeButton';
import PanelCustomizeSheet from '@/components/panel/PanelCustomizeSheet';
import { PANEL_BLOCK_RENDERERS, PanelGreetingBlock } from '@/components/panel/PanelBlocks';
import { PanelDataProvider } from '@/components/panel/PanelDataProvider';
import { usePanelConfig } from '@/hooks/usePanelConfig';
import { PANEL_BLOCK_BY_ID, type PanelBlockId } from '@/lib/panel/panel-blocks';

/**
 * Construcción visual del panel:
 *  - Los bloques `large` se renderizan en su orden absoluto.
 *  - Los `small` se mantienen siempre con su tamaño cuadrado (1/3 de ancho)
 *    y se empacan TODOS juntos en filas de 3, sin huecos.
 *  - El "mosaico" de smalls aparece en la posición del PRIMER small en el
 *    orden del usuario. Así, arrastrando cualquier small hacia arriba o
 *    abajo, el bloque de smalls se mueve al sitio elegido, manteniendo el
 *    orden interno entre ellos.
 */
type PanelRow =
  | { kind: 'large'; id: PanelBlockId }
  | { kind: 'small-row'; ids: PanelBlockId[] };

const SMALL_PER_ROW = 3;

function buildRows(visibleBlockIds: readonly PanelBlockId[]): PanelRow[] {
  const smalls: PanelBlockId[] = [];
  const firstSmallIndex = visibleBlockIds.findIndex((id) => {
    const meta = PANEL_BLOCK_BY_ID[id];
    return meta?.size === 'small';
  });

  for (const id of visibleBlockIds) {
    const meta = PANEL_BLOCK_BY_ID[id];
    if (meta?.size === 'small') smalls.push(id);
  }

  const rows: PanelRow[] = [];
  let smallsRendered = false;
  const renderSmalls = () => {
    if (smallsRendered) return;
    for (let i = 0; i < smalls.length; i += SMALL_PER_ROW) {
      rows.push({ kind: 'small-row', ids: smalls.slice(i, i + SMALL_PER_ROW) });
    }
    smallsRendered = true;
  };

  visibleBlockIds.forEach((id, idx) => {
    const meta = PANEL_BLOCK_BY_ID[id];
    if (!meta) return;
    if (meta.size === 'large') {
      rows.push({ kind: 'large', id });
    } else if (idx === firstSmallIndex) {
      renderSmalls();
    }
    // Los otros smalls se ignoran porque ya están renderizados dentro del
    // mosaico en la posición del primer small.
  });
  // Por seguridad, si quedaron smalls sin renderizar (no debería ocurrir).
  renderSmalls();
  return rows;
}

export default function OperationalDayHome() {
  return (
    <PanelDataProvider>
      <OperationalDayHomeInner />
    </PanelDataProvider>
  );
}

function OperationalDayHomeInner() {
  const panel = usePanelConfig();
  const [customizeOpen, setCustomizeOpen] = React.useState(false);

  // Permite abrir el sheet desde fuera (p. ej. menú hamburguesa) vía evento.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOpen = () => setCustomizeOpen(true);
    window.addEventListener('chef-one:panel-customize:open', onOpen);
    return () => window.removeEventListener('chef-one:panel-customize:open', onOpen);
  }, []);

  return (
    <div className="space-y-4 pb-2">
      <PanelGreetingBlock />

      <PanelCriticalAlerts visibleBlockIds={panel.visibleBlockIds} />

      <ProductoGuiadoChecklist />

      <section id="panel-bloques" className="scroll-mt-28 space-y-3">
        {buildRows(panel.visibleBlockIds).map((row, index) => {
          if (row.kind === 'large') {
            const Renderer = PANEL_BLOCK_RENDERERS[row.id];
            if (!Renderer) return null;
            return <Renderer key={row.id} />;
          }
          // Las filas siempre usan grid-cols-3 para mantener el tamaño cuadrado
          // pequeño y consistente, aunque la última fila tenga menos de 3 ítems.
          return (
            <div key={`small-row-${index}`} className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {row.ids.map((id) => {
                const Renderer = PANEL_BLOCK_RENDERERS[id];
                if (!Renderer) return null;
                return <Renderer key={id} />;
              })}
            </div>
          );
        })}
      </section>

      <div className="pt-1">
        <PanelCustomizeButton onClick={() => setCustomizeOpen(true)} />
      </div>

      <PanelCustomizeSheet
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        panel={panel}
      />
    </div>
  );
}
