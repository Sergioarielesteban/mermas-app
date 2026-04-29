import Link from 'next/link';
import { Check } from 'lucide-react';

const BRAND = '#D32F2F';

const plans = [
  {
    name: 'Operativo',
    modules: ['Pedidos', 'Recepción', 'Mermas', 'Chat interno'],
  },
  {
    name: 'Control',
    modules: ['Todo Operativo', 'Escandallos', 'Finanzas', 'Inventario'],
    recommended: true,
  },
  {
    name: 'PRO',
    modules: ['Todo Control', 'APPCC completo', 'Equipo y horarios', 'Soporte prioritario'],
  },
] as const;

export default function MarketingPricingHighlight() {
  return (
    <section
      id="precio"
      className="scroll-mt-[4.5rem] border-t border-slate-200/70 bg-gradient-to-b from-slate-50/95 via-white to-[#f5f6f8] px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-20 md:py-24"
      aria-labelledby="precio-impacto-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="precio-impacto-heading" className="text-balance text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            Planes claros para empezar hoy
          </h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">Elige por nivel de operación y escala cuando lo necesites.</p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border bg-white p-5 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.2)] ring-1 sm:p-6 ${
                'recommended' in plan && plan.recommended
                  ? 'border-[#D32F2F]/40 ring-[#D32F2F]/20'
                  : 'border-stone-200 ring-stone-100'
              }`}
            >
              <p className="text-sm font-extrabold text-stone-900">{plan.name}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#D32F2F]">Empieza sin permanencia</p>
              <p className="mt-2 text-2xl font-black text-stone-900">Próximamente</p>
              <p className="mt-1 text-xs text-stone-500">Estamos definiendo el precio final de este plan</p>
              <p className="mt-1 text-xs font-medium text-stone-600">Cancela cuando quieras</p>

              <ul className="mt-4 space-y-2">
                {plan.modules.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-stone-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D32F2F]" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <details className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-semibold text-stone-700">Ver módulos incluidos</summary>
                <p className="mt-2 text-xs leading-snug text-stone-600">
                  Recomendamos este plan para equipos que quieren estandarizar operación y tener datos listos para decidir.
                </p>
              </details>
            </article>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="#solicitar-info"
            className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-[0_14px_36px_-10px_rgba(211,47,47,0.45)] transition hover:brightness-105 active:scale-[0.99]"
            style={{ backgroundColor: BRAND }}
          >
            Ver planes y activar
          </Link>
        </div>
      </div>
    </section>
  );
}
