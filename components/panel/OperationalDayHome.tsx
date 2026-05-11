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
 * Construcción visual del panel: primero todos los bloques `large` en el orden
 * que el usuario haya definido, y al final un mosaico tipo iOS con TODOS los
 * `small` empacados en filas de 3 (sin huecos). El orden relativo entre smalls
 * se preserva. Esto evita que un bloque pequeño aislado deje espacio vacío al
 * intercalarse entre dos grandes.
 */
type PanelRow =
  | { kind: 'large'; id: PanelBlockId }
  | { kind: 'small-row'; ids: PanelBlockId[] };

const SMALL_PER_ROW = 3;

function buildRows(visibleBlockIds: readonly PanelBlockId[]): PanelRow[] {
  const larges: PanelBlockId[] = [];
  const smalls: PanelBlockId[] = [];
  for (const id of visibleBlockIds) {
    const meta = PANEL_BLOCK_BY_ID[id];
    if (!meta) continue;
    if (meta.size === 'large') larges.push(id);
    else smalls.push(id);
  }

  const rows: PanelRow[] = [];
  for (const id of larges) rows.push({ kind: 'large', id });
  for (let i = 0; i < smalls.length; i += SMALL_PER_ROW) {
    rows.push({ kind: 'small-row', ids: smalls.slice(i, i + SMALL_PER_ROW) });
  }
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
          return (
            <div
              key={`small-row-${index}`}
              className="grid grid-cols-3 gap-1.5 sm:gap-2"
            >
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
