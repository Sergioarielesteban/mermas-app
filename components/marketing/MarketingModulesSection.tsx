'use client';

import { useCallback, useState } from 'react';
import ExpandableModuleCard from './ExpandableModuleCard';
import { MARKETING_MODULES } from './moduleDefinitions';

export default function MarketingModulesSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section
      id="modulos"
      className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-gradient-to-b from-[#fafafa] via-white to-[#f8f9fb] px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-24"
      aria-labelledby="modulos-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#D32F2F]/90">Producto</p>
          <h2 id="modulos-heading" className="mt-3 text-balance text-2xl font-bold tracking-tight text-stone-900 sm:text-4xl sm:leading-tight">
            Seis frentes de tu cocina, en módulos claros
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-stone-600 sm:text-base">
            Toca una tarjeta para ver beneficios, un caso real y el resultado. Solo una abierta a la vez: menos ruido,
            más foco.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {MARKETING_MODULES.map((mod) => (
            <li key={mod.id} className="list-none [perspective:1200px]">
              <ExpandableModuleCard module={mod} isOpen={openId === mod.id} onToggle={() => toggle(mod.id)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
