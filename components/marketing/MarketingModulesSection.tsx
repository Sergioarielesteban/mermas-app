'use client';

import PremiumSaaSModuleCards from './PremiumSaaSModuleCards';

export default function MarketingModulesSection() {
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

        <PremiumSaaSModuleCards className="mt-12" />
      </div>
    </section>
  );
}
