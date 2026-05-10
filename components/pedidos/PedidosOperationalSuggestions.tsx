'use client';

import React from 'react';
import PedidosOperationalSuggestionCard, {
  SUGGESTION_CARD_HEIGHT_PX,
} from '@/components/pedidos/PedidosOperationalSuggestionCard';
import type { OperationalSuggestion } from '@/lib/pedidos-operational-suggestions';

/** Entre avances automáticos (3–4 s). */
const AUTO_TICK_MS = 3500;
/** Sin interacción antes de reanudar auto-avance (4–5 s). */
const AUTO_IDLE_MS = 4500;
/** Duración del desplazamiento horizontal programático (suave, no brusco). */
const SCROLL_ANIM_MS = 720;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function animateScrollLeft(
  el: HTMLElement,
  targetLeft: number,
  durationMs: number,
  onComplete?: () => void,
) {
  const from = el.scrollLeft;
  const delta = targetLeft - from;
  if (Math.abs(delta) < 0.5) {
    onComplete?.();
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    el.scrollLeft = from + delta * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(tick);
    else onComplete?.();
  };
  requestAnimationFrame(tick);
}

function slideWidth(el: HTMLUListElement | null): number {
  if (!el) return 0;
  return el.clientWidth;
}

export type PedidosOperationalSuggestionsProps = {
  suggestions: OperationalSuggestion[];
  onApply: (suggestion: OperationalSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
  applyingId: string | null;
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
  const [, bumpResize] = React.useState(0);

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
    const w = slideWidth(el);
    if (w <= 0) return;
    const idx = Math.min(
      suggestions.length - 1,
      Math.max(0, Math.round(el.scrollLeft / w)),
    );
    setActiveDot(idx);
  }, [suggestions.length]);

  React.useLayoutEffect(() => {
    updateActiveFromScroll();
  }, [suggestions, updateActiveFromScroll]);

  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      bumpResize((n) => n + 1);
      updateActiveFromScroll();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateActiveFromScroll]);

  const scrollToIndex = React.useCallback(
    (index: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      const w = slideWidth(el);
      if (w <= 0) return;
      const clamped = Math.max(0, Math.min(suggestions.length - 1, index));
      const target = clamped * w;
      autoScrollRef.current = true;
      if (reducedMotion) {
        el.scrollLeft = target;
        window.setTimeout(() => {
          autoScrollRef.current = false;
        }, 50);
        return;
      }
      animateScrollLeft(el, target, SCROLL_ANIM_MS, () => {
        window.setTimeout(() => {
          autoScrollRef.current = false;
        }, 80);
      });
    },
    [reducedMotion, suggestions.length],
  );

  React.useEffect(() => {
    if (reducedMotion || suggestions.length <= 1) return;

    const id = window.setInterval(() => {
      if (Date.now() - lastInteractionRef.current < AUTO_IDLE_MS) return;
      const el = scrollerRef.current;
      if (!el) return;
      const w = slideWidth(el);
      if (w <= 0) return;
      const idx = Math.round(el.scrollLeft / w);
      const next = (idx + 1) % suggestions.length;
      const target = next * w;
      autoScrollRef.current = true;
      animateScrollLeft(el, target, SCROLL_ANIM_MS, () => {
        window.setTimeout(() => {
          autoScrollRef.current = false;
        }, 80);
      });
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
      className="border-b border-zinc-100/90 bg-gradient-to-b from-[#FFF9F9]/60 to-transparent px-0 py-1"
      aria-live="polite"
    >
      <div className="px-3 pb-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Sugerencias</p>
      </div>

      <div className="px-3">
        <ul
          ref={scrollerRef}
          onScroll={onScrollerScroll}
          onPointerDown={onScrollerPointerDown}
          onTouchStart={onScrollerPointerDown}
          className={[
            'flex w-full gap-0 overflow-x-auto overscroll-x-contain px-0 pb-0.5',
            'snap-x snap-mandatory',
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
              className="w-full min-w-full shrink-0 snap-start snap-always"
              style={{
                flex: '0 0 100%',
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
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
      </div>

      {suggestions.length > 1 ? (
        <div className="flex justify-center gap-0.5 px-3 pt-0.5 pb-0.5">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={[
                'h-1 w-1 rounded-full p-0 transition-all duration-200',
                i === activeDot ? 'scale-105 bg-[#E30613]' : 'bg-zinc-300/85',
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

      <span className="sr-only">
        Carrusel de sugerencias, {suggestions.length} elementos, ancho completo del catálogo. Las tarjetas compactas
        miden unos {SUGGESTION_CARD_HEIGHT_PX} píxeles de alto; las de riesgo de falta estimado son más altas.
      </span>
    </div>
  );
});
