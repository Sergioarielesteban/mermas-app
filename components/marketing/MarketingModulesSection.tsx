'use client';

import PremiumSaaSModuleCards from './PremiumSaaSModuleCards';

export default function MarketingModulesSection() {
  return (
    <section
      id="modulos"
      className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-gradient-to-b from-[#fafafa] via-white to-[#f8f9fb] px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-20"
      aria-labelledby="modulos-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D32F2F]/90">Producto</p>
          <h2 id="modulos-heading" className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl sm:leading-tight">
            Módulos que puedes encender a tu ritmo
          </h2>
          <p className="mt-3 text-pretty text-sm leading-snug text-stone-600 sm:text-base">
            No todo el mundo necesita todo el día uno. Toca una tarjeta para el detalle: beneficios, ejemplo y resultado.
          </p>
        </div>

        <PremiumSaaSModuleCards className="mt-10" />
      </div>
    </section>
  );
}
