import { ClipboardCheck, Users, UtensilsCrossed, Zap } from 'lucide-react';

const BRAND = '#D32F2F';

const pillars = [
  {
    Icon: UtensilsCrossed,
    title: 'Cocineros y profesionales del sector',
    body: 'No hace falta un cargo concreto: si trabajas en cocina, la herramienta tiene sentido para ti.',
  },
  {
    Icon: Users,
    title: 'Equipos que quieren trabajar mejor',
    body: 'Misma información para el turno, sin depender de que “esté quien suele saberlo”.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Control real del día a día',
    body: 'Lo que ocurre queda registrado: menos memoria, menos “¿esto lo apuntamos?”.',
  },
  {
    Icon: Zap,
    title: 'Útil desde el primer día',
    body: 'Pensada para el ritmo del servicio: pocos toques, sin curso ni manual eterno.',
  },
] as const;

export default function MarketingCocinerosSection() {
  return (
    <section
      id="cocineros"
      className="scroll-mt-[4.5rem] border-y border-stone-200/70 bg-white px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-20"
      aria-labelledby="cocineros-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(280px,380px)] lg:items-start lg:gap-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Hecha en cocina</p>
            <h2
              id="cocineros-heading"
              className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-3xl sm:leading-tight"
            >
              Una app de cocineros para cocineros
            </h2>
            <p className="mt-4 text-pretty text-base font-semibold leading-snug text-stone-800 sm:text-lg sm:leading-snug">
              No necesitas ser dueño de un restaurante para trabajar con orden.
            </p>

            <div className="mt-8 space-y-5 text-pretty text-sm leading-relaxed text-stone-700 sm:text-base sm:leading-relaxed">
              <p>
                Muchos cocineros quieren hacer bien su trabajo, pero no tienen herramientas pensadas para cómo se cocina
                de verdad: con prisas, cambios de turno y poco margen para perder el tiempo.
              </p>
              <p>
                Al final todo acaba en papeles, en la cabeza o en sistemas que no encajan con el ritmo del servicio. Lo
                que necesitas es algo que puedas usar entre un pedido y otro, sin sentir que te estás formando en otra
                carrera.
              </p>
              <p>
                Chef-One sirve para registrar, organizar y ver con claridad el día a día — pedidos, mermas, frío, stock,
                avisos del equipo — sin convertirlo en un segundo trabajo. Sirve en{' '}
                <strong className="font-semibold text-stone-900">cualquier cocina que quiera trabajar mejor</strong>, con
                equipo o cuando quieres mantener tu propio estándar profesional.
              </p>
              <p>
                Está hecha para el ritmo real de cocina: rápida, directa y práctica. Sin formación larga ni tiempo extra:
                aquí no sobra ni un minuto.
              </p>
            </div>

            <p
              className="mt-10 border-l-4 pl-5 text-base font-semibold leading-snug text-stone-900 sm:text-lg sm:leading-snug"
              style={{ borderColor: BRAND }}
            >
              Si te tomas la cocina en serio, necesitas una herramienta que esté a tu nivel.{' '}
              <span className="font-medium text-stone-700">
                Para quienes quieren hacer las cosas bien, incluso cuando nadie está mirando.
              </span>
            </p>
          </div>

          <aside
            className="rounded-2xl border border-stone-200/80 bg-gradient-to-b from-stone-50/90 to-white p-6 shadow-[0_8px_32px_-16px_rgba(15,23,42,0.12)] ring-1 ring-stone-100/90 sm:p-7"
            aria-label="Por qué encaja con cocina real"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Qué la hace distinta</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {pillars.map(({ Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-stone-100/90 bg-white/80 p-4 shadow-sm ring-1 ring-stone-100/80"
                >
                  <div className="flex gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                      style={{
                        background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)`,
                      }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-bold leading-snug text-stone-900">{title}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-stone-600 sm:text-[13px]">{body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}
