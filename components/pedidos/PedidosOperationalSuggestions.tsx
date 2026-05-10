'use client';

import React from 'react';
import PedidosOperationalSuggestionCard, {
  SUGGESTION_CARD_HEIGHT_PX,
  SUGGESTION_CARD_WIDTH_PX,
} from '@/components/pedidos/PedidosOperationalSuggestionCard';
import type { OperationalSuggestion } from '@/lib/pedidos-operational-suggestions';

const CARD_GAP_PX = 8;
const SCROLL_STEP = SUGGESTION_CARD_WIDTH_PX + CARD_GAP_PX;
/** Solo auto-avanza si el usuario lleva esto sin interactuar. */
const AUTO_IDLE_MS = 6000;
/** Intervalo entre intentos de avance (suave, no invasivo). */
const AUTO_TICK_MS = 5500;

export type PedidosOperationalSuggestionsProps = {
  suggestions: OperationalSuggestion[];
  onApply: (suggestion: OperationalSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
  applyingId: string | null;
  /** Incrementar al escribir en buscador o cambiar cantidades (pausa auto-avance). */
  interactionEpoch?: number;
};

export default React.memo(function PedidosOperationalSuggestions({
  suggestions,
  onApply,
  onDismiss,
  applyingId,
  interactionEpoch = 0,
}: PedidosOperationalSuggestionsProps) {
  const scrollerRef = React.useRef<HTMLUListElement | null>(null);
  const autoScrollRef = React.useRef(false);
  const lastInteractionRef = React.useRef(0);
  const [activeDot, setActiveDot] = React.useState(0);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const markInteraction = React.useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  React.useEffect(() => {
    lastInteractionRef.current = Date.now();
  }, [interactionEpoch]);

  React.useEffect(() => {
    const onWinScroll = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener('scroll', onWinScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onWinScroll, { capture: true });
  }, []);

  const updateActiveFromScroll = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el || suggestions.length === 0) return;
    const idx = Math.min(
      suggestions.length - 1,
      Math.max(0, Math.round(el.scrollLeft / SCROLL_STEP)),
    );
    setActiveDot(idx);
  }, [suggestions.length]);

  React.useLayoutEffect(() => {
    updateActiveFromScroll();
  }, [suggestions, updateActiveFromScroll]);

  const scrollToIndex = React.useCallback((index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(suggestions.length - 1, index));
    autoScrollRef.current = true;
    el.scrollTo({ left: clamped * SCROLL_STEP, behavior: 'smooth' });
    window.setTimeout(() => {
      autoScrollRef.current = false;
    }, 750);
  }, [suggestions.length]);

  /** Auto-avance 1 tarjeta si hay inactividad; desactivado con prefers-reduced-motion. */
  React.useEffect(() => {
    if (reducedMotion || suggestions.length <= 1) return;

    const id = window.setInterval(() => {
      if (Date.now() - lastInteractionRef.current < AUTO_IDLE_MS) return;
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / SCROLL_STEP);
      const next = (idx + 1) % suggestions.length;
      autoScrollRef.current = true;
      el.scrollTo({ left: next * SCROLL_STEP, behavior: 'smooth' });
      window.setTimeout(() => {
        autoScrollRef.current = false;
      }, 750);
    }, AUTO_TICK_MS);

    return () => window.clearInterval(id);
  }, [reducedMotion, suggestions.length]);

  const onScrollerScroll = React.useCallback(() => {
    if (!autoScrollRef.current) markInteraction();
    updateActiveFromScroll();
  }, [markInteraction, updateActiveFromScroll]);

  const onScrollerPointerDown = React.useCallback(() => {
    markInteraction();
  }, [markInteraction]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className="border-b border-zinc-100/90 bg-gradient-to-b from-[#FFF9F9]/70 to-transparent px-0 py-1.5"
      aria-live="polite"
    >
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Sugerencias</p>
        {suggestions.length > 1 ? (
          <div className="flex items-center gap-1">
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={[
                  'h-1.5 w-1.5 rounded-full p-0 transition-all duration-200',
                  i === activeDot ? 'scale-110 bg-[#E30613]' : 'bg-zinc-300/90',
                ].join(' ')}
                aria-label={`Ir a sugerencia ${i + 1}`}
                onClick={() => {
                  markInteraction();
                  scrollToIndex(i);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <ul
        ref={scrollerRef}
        onScroll={onScrollerScroll}
        onPointerDown={onScrollerPointerDown}
        onTouchStart={onScrollerPointerDown}
        className={[
          'flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-3 pb-1',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'touch-pan-x',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {suggestions.map((s) => (
          <li
            key={s.id}
            style={{
              flex: '0 0 auto',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
            }}
            className="snap-start"
          >
            <PedidosOperationalSuggestionCard
              suggestion={s}
              disabled={applyingId === s.id}
              onAdd={() => {
                markInteraction();
                onApply(s);
              }}
              onDismiss={() => {
                markInteraction();
                onDismiss(s.id);
              }}
            />
          </li>
        ))}
      </ul>

      <span className="sr-only">
        Carrusel de sugerencias, {suggestions.length} elementos, tarjetas de {SUGGESTION_CARD_WIDTH_PX}×
        {SUGGESTION_CARD_HEIGHT_PX} px
      </span>
    </div>
  );
});
