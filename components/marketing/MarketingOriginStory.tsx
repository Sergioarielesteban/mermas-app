import { Clock, MessageCircle, FileQuestion, UserMinus, Zap } from 'lucide-react';

const BRAND = '#D32F2F';

const painPoints = [
  { Icon: Clock, label: 'Cada minuto cuenta' },
  { Icon: FileQuestion, label: 'Datos en papeles y notas' },
  { Icon: MessageCircle, label: 'WhatsApp y mensajes sueltos' },
  { Icon: UserMinus, label: 'Sin referencia si falta el responsable' },
  { Icon: Zap, label: 'Tiene que ser rápido o no sirve' },
] as const;

export default function MarketingOriginStory() {
  return (
    <section
      id="origen"
      className="scroll-mt-[4.5rem] border-y border-stone-200/70 bg-gradient-to-b from-stone-100/90 via-[#f6f5f4] to-stone-50/80 px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-20"
      aria-labelledby="origen-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(260px,320px)] lg:items-start lg:gap-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Por qué nace Chef-One</p>
            <h2 id="origen-heading" className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-3xl sm:leading-tight">
              Esto no nace en una oficina.
              <span className="mt-1 block text-[#b71c1c] sm:mt-0 sm:inline sm:before:content-['\00a0']">
                Nace en una cocina.
              </span>
            </h2>

            <div className="mt-8 space-y-5 text-pretty text-sm leading-relaxed text-stone-700 sm:text-base sm:leading-relaxed">
              <p>
                Como cocinero, llevaba años buscando algo simple: registrar lo importante en pocos toques, sin marear al
                equipo y sin comerme minutos que no existen.
              </p>
              <p>
                En cocina la información se pierde entre papeles, fotos y chats. Cuando no está quien suele llevar el
                ritmo, cuesta saber qué se pidió, qué llegó mal o qué había que vigilar. Todo eso en un sitio que no te
                obligue a pensar en la herramienta: si te frena, en la práctica no existe.
              </p>
              <p>
                Porque aquí no sobra tiempo. Cualquier cosa que añada fricción acaba en el olvido. Hacía falta algo que
                aguantara el día a día real —servicio, prisas, cambios de turno— sin convertirse en un trámite más.
              </p>
            </div>

            <p
              className="mt-10 border-l-4 pl-5 text-base font-semibold leading-snug text-stone-900 sm:text-lg sm:leading-snug"
              style={{ borderColor: BRAND }}
            >
              Chef-One nace para que cualquier equipo de cocina pueda trabajar con orden, sin complicarse la vida.
            </p>
          </div>

          <aside
            className="rounded-2xl border border-stone-200/80 bg-white/80 p-6 shadow-[0_8px_32px_-16px_rgba(15,23,42,0.12)] ring-1 ring-stone-100/90 backdrop-blur-sm sm:p-7"
            aria-label="Lo que se vivía en cocina"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">El caos de cada día</p>
            <ul className="mt-5 space-y-4">
              {painPoints.map(({ Icon, label }) => (
                <li key={label} className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                    style={{
                      background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)`,
                    }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="pt-2 text-sm font-medium leading-snug text-stone-800">{label}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
}
