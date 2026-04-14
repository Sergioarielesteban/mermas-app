import { Clock, MessageCircle, FileQuestion, UserMinus, Zap } from 'lucide-react';

const BRAND = '#D32F2F';

const painPoints = [
  { Icon: Clock, label: 'Cada minuto cuenta' },
  { Icon: FileQuestion, label: 'Datos en papeles' },
  { Icon: MessageCircle, label: 'Todo en chats sueltos' },
  { Icon: UserMinus, label: 'Si falta el jefe, se corta el hilo' },
  { Icon: Zap, label: 'O es rápido o no se usa' },
] as const;

export default function MarketingOriginStory() {
  return (
    <section
      id="origen"
      className="scroll-mt-[4.5rem] border-y border-stone-200/70 bg-gradient-to-b from-stone-50/95 via-white to-stone-50/80 px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-16"
      aria-labelledby="origen-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D32F2F]/90">Por qué existe Chef-One</p>
          <h2
            id="origen-heading"
            className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-3xl sm:leading-tight"
          >
            Pensado entre servicio y servicio
          </h2>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_minmax(260px,300px)] lg:items-start lg:gap-12">
          <div className="space-y-4 text-pretty text-sm leading-relaxed text-stone-700 sm:text-base">
            <p>
              Chef-One lo impulsa un cocinero: había que registrar lo importante en pocos toques, sin marear al equipo.
            </p>
            <p>
              Cuando la información vive en fotos, notas y grupos, cualquier cambio de turno es una ruleta. La app
              nace para que lo crítico quede en un solo sitio — claro, rápido y serio cuando hace falta.
            </p>
            <p
              className="border-l-4 pl-4 text-base font-semibold leading-snug text-stone-900 sm:text-lg"
              style={{ borderColor: BRAND }}
            >
              No es un PowerPoint bonito: es herramienta para el día a día de cocina.
            </p>
          </div>

          <aside
            className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.14)] ring-1 ring-stone-100 sm:p-6"
            aria-label="Dolor del día a día"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Suena familiar</p>
            <ul className="mt-4 space-y-3">
              {painPoints.map(({ Icon, label }) => (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-md"
                    style={{
                      background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)`,
                    }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-stone-800">{label}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}
