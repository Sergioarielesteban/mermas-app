import { ClipboardCheck, Users, UtensilsCrossed, Zap } from 'lucide-react';

const BRAND = '#D32F2F';

const pillars = [
  {
    Icon: UtensilsCrossed,
    title: 'Para quien cocina',
    body: 'Dueño, jefe de partida o equipo: si estás en cocina, encaja.',
  },
  {
    Icon: Users,
    title: 'Misma foto para todos',
    body: 'Turno mañana y noche ven lo mismo, sin depender de una sola persona.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Menos “¿lo apuntamos?”',
    body: 'Lo importante queda registrado, no solo en la cabeza de alguien.',
  },
  {
    Icon: Zap,
    title: 'Rápida o no sirve',
    body: 'Pocos toques entre un pedido y otro. Sin manual infinito.',
  },
] as const;

export default function MarketingCocinerosSection() {
  return (
    <section
      id="cocineros"
      className="scroll-mt-[4.5rem] border-y border-stone-200/70 bg-white px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-16"
      aria-labelledby="cocineros-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start lg:gap-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Quién la usa</p>
            <h2
              id="cocineros-heading"
              className="mt-2 text-balance text-2xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-3xl"
            >
              De cocineros, para cocina real
            </h2>
            <p className="mt-4 text-pretty text-sm leading-relaxed text-stone-700 sm:text-base">
              No hace falta ser el dueño: si te tomas el servicio en serio, Chef-One te da orden sin convertir la
              herramienta en un segundo trabajo.
            </p>
            <p
              className="mt-6 border-l-4 pl-4 text-sm font-semibold leading-snug text-stone-900 sm:text-base"
              style={{ borderColor: BRAND }}
            >
              Menos postureo, más criterio cuando nadie está mirando.
            </p>
          </div>

          <aside
            className="rounded-2xl border border-stone-200/80 bg-gradient-to-b from-stone-50/90 to-white p-5 ring-1 ring-stone-100 sm:p-6"
            aria-label="Pilares"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">En una frase</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {pillars.map(({ Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-stone-100/90 bg-white/90 p-3.5 shadow-sm ring-1 ring-stone-100/80"
                >
                  <div className="flex gap-3">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                      style={{
                        background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)`,
                      }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900">{title}</p>
                      <p className="mt-1 text-xs leading-snug text-stone-600">{body}</p>
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
