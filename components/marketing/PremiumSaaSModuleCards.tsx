'use client';

import { useCallback, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { MarketingModuleDefinition } from './moduleDefinitions';
import { MARKETING_MODULES } from './moduleDefinitions';

const BRAND = '#D32F2F';

/** Curva tipo SaaS: entra rápido, sale suave */
const easePremium: [number, number, number, number] = [0.16, 1, 0.3, 1];

type CardProps = {
  mod: MarketingModuleDefinition;
  isOpen: boolean;
  onToggle: () => void;
};

function PremiumExpandableCard({ mod, isOpen, onToggle }: CardProps) {
  const reduceMotion = useReducedMotion();
  const Icon = mod.Icon;
  const cardRef = useRef<HTMLElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spring = { stiffness: 320, damping: 28, mass: 0.55 };
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [4.5, -4.5]), spring);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-4.5, 4.5]), spring);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  const handlePointerLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.article
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      style={{
        rotateX: reduceMotion ? 0 : rotateX,
        rotateY: reduceMotion ? 0 : rotateY,
        transformStyle: 'preserve-3d',
      }}
      className={`relative isolate overflow-hidden border backdrop-blur-xl transition-[border-color,box-shadow] duration-500 ease-out touch-manipulation ${
        isOpen
          ? 'border-slate-200/95 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_24px_56px_-28px_rgba(15,23,42,0.18),0_10px_24px_-12px_rgba(211,47,47,0.09)] ring-1 ring-slate-900/[0.04]'
          : 'border-slate-200/80 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_4px_12px_-4px_rgba(15,23,42,0.06),0_18px_44px_-22px_rgba(15,23,42,0.11)] ring-1 ring-slate-900/[0.025] hover:border-slate-300/90 hover:shadow-[0_22px_48px_-24px_rgba(15,23,42,0.16)]'
      } rounded-[1.75rem] bg-gradient-to-b from-white/95 via-white/90 to-slate-50/40 sm:rounded-[2rem]`}
    >
      {/* Brillo superior tipo vidrio */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-1/2 top-0 z-0 h-[120%] w-full skew-y-[-12deg] bg-gradient-to-br from-white/50 via-transparent to-transparent"
        aria-hidden
      />

      <motion.button
        type="button"
        id={`premium-module-${mod.id}`}
        aria-expanded={isOpen}
        aria-controls={`premium-panel-${mod.id}`}
        onClick={onToggle}
        whileTap={reduceMotion ? undefined : { scale: 0.988 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        className={`relative z-10 flex w-full min-h-[4.5rem] items-start gap-4 p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:bg-slate-50/50 sm:min-h-0 sm:gap-5 sm:p-6 md:p-7 ${
          isOpen ? 'rounded-t-[1.75rem] sm:rounded-t-[2rem]' : 'rounded-[1.75rem] sm:rounded-[2rem]'
        }`}
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg sm:h-[3.75rem] sm:w-[3.75rem] sm:rounded-[1.15rem]"
          style={{
            background: `linear-gradient(155deg, ${BRAND} 0%, #9a1818 100%)`,
            boxShadow:
              '0 4px 16px -4px rgba(211,47,47,0.45), 0 1px 0 rgba(255,255,255,0.2) inset',
          }}
          aria-hidden
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.65} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[0.9375rem] font-semibold leading-snug tracking-tight text-slate-900 sm:text-lg md:text-xl">
                {mod.title}
              </h3>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-600 sm:text-[0.9375rem]">
                {mod.summary}
              </p>
            </div>
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{
                duration: reduceMotion ? 0.12 : 0.4,
                ease: easePremium,
              }}
              className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100/95 text-slate-600 ring-1 ring-slate-200/90 sm:h-12 sm:w-12 sm:rounded-2xl"
              aria-hidden
            >
              <ChevronDown className="h-5 w-5 sm:h-5 sm:w-5" strokeWidth={2.2} />
            </motion.span>
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-[#D32F2F]/70" aria-hidden />
              {isOpen ? 'Cerrar detalle' : 'Ampliar detalle'}
            </span>
          </p>
        </div>
      </motion.button>

      <motion.div
        id={`premium-panel-${mod.id}`}
        role="region"
        aria-labelledby={`premium-module-${mod.id}`}
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{
          height: {
            duration: reduceMotion ? 0.12 : 0.44,
            ease: easePremium,
          },
          opacity: {
            duration: reduceMotion ? 0.1 : 0.28,
            delay: isOpen ? 0.06 : 0,
            ease: easePremium,
          },
        }}
        className="relative z-10 overflow-hidden border-t border-slate-100/90"
      >
        <div className="space-y-5 px-5 pb-6 pt-2 sm:space-y-6 sm:px-7 sm:pb-8 sm:pt-3 md:px-8 md:pb-9">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Descripción</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem]">{mod.detailIntro}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Beneficios</p>
            <ul className="mt-3 space-y-2.5">
              {mod.benefits.map((b) => (
                <li
                  key={b.slice(0, 28)}
                  className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem]"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D32F2F]"
                    aria-hidden
                  />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-100/90 bg-slate-50/80 px-4 py-4 sm:rounded-[1.25rem] sm:px-5 sm:py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Caso real</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem]">
              &ldquo;{mod.realCase}&rdquo;
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/95 via-white to-white px-4 py-4 sm:rounded-[1.25rem] sm:px-5 sm:py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800/85">Resultado</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-950 sm:text-[0.9375rem]">
              {mod.result}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.article>
  );
}

export type PremiumSaaSModuleCardsProps = {
  /** Por defecto la lista de módulos del producto (MARKETING_MODULES); puedes pasar otra lista para pruebas */
  modules?: MarketingModuleDefinition[];
  className?: string;
};

/**
 * Grid de tarjetas premium expansibles (módulos del producto).
 * Una sola abierta; tilt 3D suave en desktop; tap claro en móvil.
 */
export default function PremiumSaaSModuleCards({
  modules = MARKETING_MODULES,
  className = '',
}: PremiumSaaSModuleCardsProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <ul
      className={`grid list-none gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 ${className}`}
    >
      {modules.map((mod) => (
        <li key={mod.id} className="[perspective:1400px]">
          <PremiumExpandableCard mod={mod} isOpen={openId === mod.id} onToggle={() => toggle(mod.id)} />
        </li>
      ))}
    </ul>
  );
}
