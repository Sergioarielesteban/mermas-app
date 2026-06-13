'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  EyeOff,
  GripVertical,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  PANEL_BLOCK_BY_ID,
  PANEL_PRESETS,
  type PanelBlockId,
  type PanelBlockMeta,
} from '@/lib/panel/panel-blocks';
import type { UsePanelConfigResult } from '@/hooks/usePanelConfig';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Estado del panel (config + acciones). */
  panel: UsePanelConfigResult;
};

/** Bottom-sheet premium para personalizar el Panel de Control. */
export default function PanelCustomizeSheet({ open, onClose, panel }: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Bloquea el scroll del body cuando se abre.
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Tecla ESC cierra.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(<Sheet onClose={onClose} panel={panel} />, document.body);
}

function Sheet({ onClose, panel }: { onClose: () => void; panel: UsePanelConfigResult }) {
  const {
    visibleBlockIds,
    availableByCategory,
    availableBlocks,
    isFavorite,
    isCritical,
    setOrder,
    toggleHidden,
    toggleFavorite,
    applyPreset,
    resetDefaults,
    config,
  } = panel;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = visibleBlockIds;
      const oldIndex = ids.indexOf(active.id as PanelBlockId);
      const newIndex = ids.indexOf(over.id as PanelBlockId);
      if (oldIndex < 0 || newIndex < 0) return;
      setOrder(arrayMove(ids, oldIndex, newIndex) as PanelBlockId[]);
    },
    [visibleBlockIds, setOrder],
  );

  const inactiveByCategory = React.useMemo(() => {
    const visible = new Set(visibleBlockIds);
    return availableByCategory
      .map((c) => ({
        ...c,
        items: c.items.filter((b) => !visible.has(b.id)),
      }))
      .filter((c) => c.items.length > 0);
  }, [availableByCategory, visibleBlockIds]);
  const visiblePresets = React.useMemo(() => {
    const availableIds = new Set(availableBlocks.map((b) => b.id));
    return PANEL_PRESETS.filter(
      (preset) =>
        preset.order.every((id) => availableIds.has(id)) &&
        preset.favorites.every((id) => availableIds.has(id)),
    );
  }, [availableBlocks]);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      {/* Sheet */}
      <div className="relative mt-auto flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-[#f5f5f7] shadow-2xl ring-1 ring-black/5">
        {/* Handle */}
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 pb-2 pt-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200/80">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[17px] font-normal leading-tight text-zinc-900">
              Personalizar panel
            </p>
            <p className="text-[11px] text-zinc-500">
              Arrastra para ordenar · ⭐ favoritos · 👁️ activa o desactiva bloques
            </p>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="grid h-8 shrink-0 place-items-center gap-1 rounded-full bg-white px-3 text-[11px] font-semibold text-zinc-700 shadow-sm ring-1 ring-zinc-200/80 active:scale-[0.97]"
            aria-label="Restablecer por defecto"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-zinc-200/80 active:scale-[0.97]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-1">
          {/* Presets */}
          {visiblePresets.length > 0 ? (
            <>
              <p className="mb-1.5 mt-2 px-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Vistas rápidas
              </p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visiblePresets.map((preset) => {
                  const active = config.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={[
                        'shrink-0 rounded-2xl px-3.5 py-2 text-left ring-1 transition-transform active:scale-[0.98]',
                        active
                          ? 'bg-zinc-900 text-white ring-zinc-900'
                          : 'bg-white text-zinc-900 ring-zinc-200/80',
                      ].join(' ')}
                      style={{ minWidth: 168 }}
                    >
                      <p
                        className={[
                          'font-serif text-[13px] font-normal leading-tight',
                          active ? 'text-white' : 'text-zinc-900',
                        ].join(' ')}
                      >
                        {preset.label}
                      </p>
                      <p
                        className={[
                          'mt-0.5 text-[10px] leading-snug',
                          active ? 'text-white/80' : 'text-zinc-500',
                        ].join(' ')}
                      >
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* Tu panel */}
          <div className="mt-2 flex items-center justify-between px-0.5">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Tu panel
            </p>
            <p className="text-[10px] text-zinc-400">{visibleBlockIds.length} bloques</p>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleBlockIds} strategy={verticalListSortingStrategy}>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {visibleBlockIds.map((id) => {
                  const meta = PANEL_BLOCK_BY_ID[id];
                  if (!meta) return null;
                  return (
                    <SortableBlockRow
                      key={id}
                      meta={meta}
                      isFavorite={isFavorite(id)}
                      isCritical={isCritical(id)}
                      onToggleFavorite={() => toggleFavorite(id)}
                      onToggleHidden={() => toggleHidden(id)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>

          {visibleBlockIds.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-center">
              <p className="text-[12px] text-zinc-500">
                No tienes bloques visibles. Activa alguno desde el catálogo de abajo.
              </p>
            </div>
          ) : null}

          {/* Catálogo */}
          {inactiveByCategory.length > 0 ? (
            <>
              <p className="mb-1 mt-5 px-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Catálogo
              </p>
              <div className="flex flex-col gap-3">
                {inactiveByCategory.map((cat) => (
                  <div key={cat.category}>
                    <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {CATEGORY_LABELS[cat.category]}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {cat.items.map((meta) => (
                        <li key={meta.id}>
                          <button
                            type="button"
                            onClick={() => toggleHidden(meta.id)}
                            className="flex w-full items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-zinc-200/80 transition-transform active:scale-[0.99]"
                          >
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600">
                              <Plus className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold leading-tight text-zinc-900">
                                {meta.title}
                              </p>
                              <p className="line-clamp-1 text-[11px] leading-snug text-zinc-500">
                                {meta.short}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Activar
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* Información preset */}
          <p className="mt-5 px-0.5 text-center text-[10px] leading-snug text-zinc-400">
            Tu configuración se guarda en este dispositivo. Pronto la sincronizaremos entre dispositivos.
          </p>

          {/* Spacer extra para evitar que el último item quede pegado al borde inferior. */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}

function SortableBlockRow({
  meta,
  isFavorite,
  isCritical,
  onToggleFavorite,
  onToggleHidden,
}: {
  meta: PanelBlockMeta;
  isFavorite: boolean;
  isCritical: boolean;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: meta.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-2 rounded-2xl bg-white px-2 py-2 shadow-sm ring-1 ring-zinc-200/80',
        isDragging ? 'z-10 shadow-lg ring-zinc-300' : '',
      ].join(' ')}
    >
      <button
        type="button"
        className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-zinc-400 active:cursor-grabbing"
        aria-label={`Mover ${meta.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold leading-tight text-zinc-900">
            {meta.title}
          </p>
          {isCritical ? (
            <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-red-700 ring-1 ring-red-200">
              Fijo
            </span>
          ) : null}
        </div>
        <p className="line-clamp-1 text-[11px] leading-snug text-zinc-500">{meta.short}</p>
      </div>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={isFavorite ? `Quitar ${meta.title} de favoritos` : `Marcar ${meta.title} como favorito`}
        className={[
          'grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors',
          isFavorite ? 'bg-amber-100 text-amber-600 ring-1 ring-amber-200' : 'text-zinc-400 hover:text-amber-500',
        ].join(' ')}
      >
        <Star
          className={['h-4 w-4', isFavorite ? 'fill-amber-500 text-amber-500' : ''].join(' ')}
          aria-hidden
        />
      </button>
      <button
        type="button"
        onClick={onToggleHidden}
        disabled={isCritical}
        aria-label={`Ocultar ${meta.title}`}
        className={[
          'grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-colors',
          isCritical
            ? 'cursor-not-allowed text-zinc-300'
            : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700',
        ].join(' ')}
      >
        <EyeOff className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}
