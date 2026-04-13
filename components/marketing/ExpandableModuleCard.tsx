'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { MarketingModuleDefinition } from './moduleDefinitions';

const BRAND = '#D32F2F';

type Props = {
  module: MarketingModuleDefinition;
  isOpen: boolean;
  onToggle: () => void;
};

export default function ExpandableModuleCard({ module: mod, isOpen, onToggle }: Props) {
  const reduceMotion = useReducedMotion();
  const Icon = mod.Icon;

  return (
    <motion.article
      className="relative isolate rounded-[1.35rem] border border-stone-200/80 bg-white/95 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18),0_1px_0_rgba(255,255,255,0.9)_inset] ring-1 ring-white/60 backdrop-blur-sm"
      style={{ transformStyle: 'preserve-3d' }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              y: -4,
              rotateX: 1.5,
              rotateY: -1.2,
              transition: { duration: 0.22, ease: 'easeOut' },
            }
      }
    >
      <div className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-gradient-to-br from-white via-white to-rose-50/30 opacity-90" />
      <button
        type="button"
        id={`module-trigger-${mod.id}`}
        aria-expanded={isOpen}
        aria-controls={`module-panel-${mod.id}`}
        onClick={onToggle}
        className="relative z-10 flex w-full items-start gap-4 rounded-[1.35rem] p-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40 focus-visible:ring-offset-2 sm:p-6"
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-md sm:h-14 sm:w-14"
          style={{
            background: `linear-gradient(145deg, ${BRAND} 0%, #b71c1c 100%)`,
            boxShadow: '0 4px 14px -3px rgba(211,47,47,0.45)',
          }}
          aria-hidden
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold leading-snug text-stone-900 sm:text-lg">{mod.title}</h3>
            <motion.span
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100/90 text-stone-600 ring-1 ring-stone-200/80"
              aria-hidden
            >
              <ChevronDown className="h-5 w-5" strokeWidth={2.25} />
            </motion.span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-600 sm:text-[0.9375rem]">{mod.summary}</p>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
            {isOpen ? 'Toca para cerrar' : 'Toca para ampliar'}
          </p>
        </div>
      </button>

      <motion.div
        id={`module-panel-${mod.id}`}
        role="region"
        aria-labelledby={`module-trigger-${mod.id}`}
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{
          height: { duration: reduceMotion ? 0.15 : 0.38, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: reduceMotion ? 0.1 : 0.25, delay: isOpen ? 0.05 : 0 },
        }}
        className="relative z-10 overflow-hidden border-t border-stone-100/90"
      >
        <div className="space-y-5 px-5 pb-6 pt-1 sm:px-6 sm:pb-7">
          <p className="text-sm leading-relaxed text-stone-700 sm:text-[0.9375rem]">{mod.detailIntro}</p>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">En la práctica</p>
            <ul className="mt-2 space-y-2">
              {mod.benefits.map((b) => (
                <li
                  key={b.slice(0, 24)}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-stone-700 before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-[#D32F2F]/85 before:content-['']"
                >
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-stone-50/90 px-4 py-3.5 ring-1 ring-stone-100">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Caso real</p>
            <p className="mt-1.5 text-sm italic leading-relaxed text-stone-700">&ldquo;{mod.realCase}&rdquo;</p>
          </div>
          <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800/90">Resultado</p>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-emerald-950">{mod.result}</p>
          </div>
        </div>
      </motion.div>
    </motion.article>
  );
}
