import { ClipboardList, HandCoins, MessageCircle, ShieldCheck, ShoppingCart, Users } from 'lucide-react';

const CATEGORY_BLOCKS = [
  {
    title: 'Operativa diaria',
    modules: [
      { name: 'Pedidos', desc: 'Pide, recibe y valida albaranes con orden.', Icon: ShoppingCart },
      { name: 'Recepción', desc: 'Todo lo que entra queda trazado y claro.', Icon: ClipboardList },
      { name: 'Precios', desc: 'Detecta cambios antes de que te descuadren.', Icon: HandCoins },
      { name: 'OCR', desc: 'Captura datos del albarán en segundos.', Icon: ClipboardList },
    ],
  },
  {
    title: 'Control económico',
    modules: [
      { name: 'Mermas', desc: 'Registra pérdidas y su impacto real.', Icon: HandCoins },
      { name: 'Escandallos', desc: 'Coste de plato y margen actualizado.', Icon: HandCoins },
      { name: 'Finanzas', desc: 'Entiende si ganas o pierdes dinero en tiempo real.', Icon: HandCoins },
      { name: 'Consumo interno', desc: 'Controla la comida de personal sin Excel.', Icon: ClipboardList },
    ],
  },
  {
    title: 'Seguridad y cumplimiento',
    modules: [
      { name: 'APPCC', desc: 'Registros listos para auditorías e inspecciones.', Icon: ShieldCheck },
      { name: 'Alérgenos', desc: 'Información sensible siempre a mano.', Icon: ShieldCheck },
      { name: 'Checklists', desc: 'Apertura, cierre y rutinas sin huecos.', Icon: ClipboardList },
    ],
  },
  {
    title: 'Equipo y operación',
    modules: [
      { name: 'Equipo', desc: 'Roles y permisos por local en un toque.', Icon: Users },
      { name: 'Horarios', desc: 'Turnos visibles para todo el equipo.', Icon: Users },
      { name: 'Comunicación', desc: 'Avisos y decisiones dentro de la app.', Icon: MessageCircle },
      { name: 'Manual operativo', desc: 'Procedimientos claros para cada turno.', Icon: ClipboardList },
    ],
  },
] as const;

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
            Funcionalidades agrupadas para decidir rápido
          </h2>
          <p className="mt-3 text-pretty text-sm leading-snug text-stone-600 sm:text-base">
            Frases cortas, módulos claros y beneficio directo.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {CATEGORY_BLOCKS.map((category) => (
            <article
              key={category.title}
              className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_8px_28px_-16px_rgba(15,23,42,0.12)] ring-1 ring-stone-100 sm:p-6"
            >
              <h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-stone-800">{category.title}</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {category.modules.map(({ name, desc, Icon }) => (
                  <li key={name} className="rounded-xl border border-stone-100 bg-stone-50/70 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#D32F2F]/10 text-[#D32F2F]">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900">{name}</p>
                        <p className="mt-1 text-xs leading-snug text-stone-600">{desc}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
