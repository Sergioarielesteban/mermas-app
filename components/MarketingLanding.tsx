import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import MarketingLeadForm from '@/components/MarketingLeadForm';
import MarketingQuickContact, { MarketingContactLinkRow } from '@/components/marketing/MarketingQuickContact';
import MarketingHero from '@/components/marketing/MarketingHero';
import MarketingPricingConfigurator from '@/components/marketing/MarketingPricingConfigurator';
import { getMarketingContactPhone } from '@/lib/marketing-contact-phone';

const BRAND = '#D32F2F';

const MODULE_GROUPS = [
  {
    title: 'Operacion diaria',
    items: [
      { name: 'Pedidos y recepcion', badge: 'Base', badgeTone: 'included', note: 'Punto de partida por local. Incluye OCR de albaranes.' },
      { name: 'Produccion', badge: 'Pack Gestion', badgeTone: 'optional', note: 'Planes por zonas, ejecucion y seguimiento diario.' },
      { name: 'Checklists', badge: 'Pack Control', badgeTone: 'optional', note: 'Apertura, cierre y rutina de turno con trazabilidad.' },
      { name: 'Chat del local', badge: 'Siempre incluido', badgeTone: 'included', note: 'Coordinacion interna incluida en todos los packs.' },
    ],
  },
  {
    title: 'Control y seguridad',
    items: [
      { name: 'APPCC', badge: 'Pack Control', badgeTone: 'optional', note: 'Temperaturas, limpieza y aceite con historial listo para inspeccion.' },
      { name: 'Mermas', badge: 'Pack Control', badgeTone: 'optional', note: 'Registro de perdida real y motivos para actuar con criterio.' },
    ],
  },
  {
    title: 'Gestion y rentabilidad',
    items: [
      { name: 'Inventario', badge: 'Pack Gestion', badgeTone: 'optional', note: 'Stock y cierres por local desde movil o tablet.' },
      { name: 'Escandallos', badge: 'Pack Gestion', badgeTone: 'optional', note: 'Coste por plato, food cost y decision de carta con datos.' },
    ],
  },
  {
    title: 'Proximamente',
    items: [
      { name: 'Fichaje', badge: 'Proximamente', badgeTone: 'soon', note: 'Fuera de packs activos en esta fase.' },
      { name: 'Horarios', badge: 'Proximamente', badgeTone: 'soon', note: 'Planificacion de turnos conectada con operativa diaria.' },
      { name: 'Cocina central', badge: 'Proximamente', badgeTone: 'soon', note: 'Pensado para operaciones multi-local de produccion.' },
    ],
  },
] as const;

const DIFFERENTIALS = [
  {
    title: 'OCR de albaranes',
    body: 'Sacas foto del albaran y Chef-One extrae lineas para acelerar recepcion. El equipo valida antes de guardar para evitar errores.',
    Icon: Camera,
  },
  {
    title: 'Ayudante IA sobre tus datos',
    body: 'Preguntas reales sobre pedidos, mermas, incidencias o food cost. Responde con informacion de la app, no con frases vacias.',
    Icon: Bot,
  },
  {
    title: 'Chat incluido siempre',
    body: 'La coordinacion del local viene de serie en todos los packs, sin extras ni letra pequena.',
    Icon: MessageCircle,
  },
  {
    title: 'Trazabilidad y registros',
    body: 'Queda historial util para operacion, auditoria y toma de decisiones en cocina real.',
    Icon: ShieldCheck,
  },
] as const;

function badgeClass(tone: 'included' | 'optional' | 'soon') {
  if (tone === 'included') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (tone === 'optional') return 'bg-amber-50 text-amber-900 ring-amber-200';
  return 'bg-zinc-100 text-zinc-700 ring-zinc-200';
}

export default function MarketingLanding() {
  const phoneContact = getMarketingContactPhone();

  return (
    <div className="min-h-[100dvh] bg-[#f8f9fb] text-stone-800 antialiased">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Ir al contenido
      </a>

      <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-white/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35"
          >
            <img src="/logo-chef-one.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0" decoding="async" />
            <span className="text-lg font-black tracking-tight" style={{ color: BRAND }}>
              Chef-One
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="#problema"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Problema real
            </Link>
            <Link
              href="#modulos"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Modulos
            </Link>
            <Link
              href="#diferenciales"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              OCR + IA
            </Link>
            <Link
              href="#precio"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Precio
            </Link>
            <Link
              href="#solicitar-info"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Contacto
            </Link>
            <Link
              href="/login"
              className="rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-900/10 transition hover:brightness-105 active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
            >
              Acceder
            </Link>
          </div>
        </div>
      </header>

      <main id="contenido">
        <MarketingHero />

        <section
          id="problema"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-white px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-18"
          aria-labelledby="problema-heading"
        >
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D32F2F]/90">El problema de fondo</p>
                <h2 id="problema-heading" className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                  Cuando el servicio aprieta, el control se rompe por mil detalles
                </h2>
                <p className="mt-4 text-pretty text-sm leading-relaxed text-stone-700 sm:text-base">
                  Pedidos en una nota, recepcion en otra, incidencias en chat y APPCC en papel: demasiado riesgo para operar
                  fino. Chef-One junta lo critico en una sola app, pensada para cocina real y uso rapido desde movil.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-gradient-to-b from-stone-50 to-white p-4 ring-1 ring-stone-100 sm:p-5">
                <p className="text-[11px] font-black uppercase tracking-wide text-stone-500">Lo que cambia</p>
                <ul className="mt-3 space-y-2.5">
                  <li className="flex items-start gap-2 text-sm text-stone-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Menos dependencia de una sola persona en turno.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-stone-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Mas orden operativo sin meter burocracia.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-stone-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Datos claros para decidir compra, coste y margen.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section
          id="modulos"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-gradient-to-b from-[#fafafa] via-white to-[#f8f9fb] px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-20"
          aria-labelledby="modulos-heading"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D32F2F]/90">Modulos</p>
              <h2 id="modulos-heading" className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                Estructura modular clara para cocina real
              </h2>
              <p className="mt-3 text-pretty text-sm text-stone-600 sm:text-base">
                Mismos contenidos de siempre, mejor ordenados: que se entienda en 20 segundos y se vea mas premium.
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {MODULE_GROUPS.map((group) => (
                <article key={group.title} className="rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm ring-1 ring-stone-100 sm:p-5">
                  <h3 className="text-base font-black tracking-tight text-stone-900">{group.title}</h3>
                  <ul className="mt-3 space-y-2.5">
                    {group.items.map((item) => (
                      <li key={item.name} className="rounded-2xl border border-stone-200 bg-zinc-50/70 p-3 ring-1 ring-zinc-100">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                          <span className={['rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1', badgeClass(item.badgeTone)].join(' ')}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">{item.note}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-white px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl rounded-3xl border border-stone-200/80 bg-gradient-to-br from-zinc-50 to-white p-5 shadow-sm ring-1 ring-stone-100 sm:p-8">
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Como se adapta</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900">Empiezas por lo urgente y escalas cuando tenga sentido.</p>
              </article>
              <article className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Lado comercial</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900">Base + packs, sin pagar por modulos que no usas.</p>
              </article>
              <article className="rounded-2xl border border-zinc-200 bg-white p-4 ring-1 ring-zinc-100">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Resultado</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900">Mas orden operativo y mejor control de margen.</p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="diferenciales"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-gradient-to-b from-white to-stone-50 px-4 py-14 sm:scroll-mt-24 sm:px-6 sm:py-18"
          aria-labelledby="diferenciales-heading"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D32F2F]/90">Funciones que marcan diferencia</p>
              <h2 id="diferenciales-heading" className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                Valor real, sin humo
              </h2>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {DIFFERENTIALS.map(({ title, body, Icon }) => (
                <article key={title} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ring-1 ring-stone-100 sm:p-5">
                  <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)` }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black tracking-tight text-stone-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-white px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-stone-200/80 bg-gradient-to-b from-zinc-50 to-white p-5 ring-1 ring-stone-100 sm:p-6">
              <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Por que Chef-One</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-zinc-900">Hecho para cocina real</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                Nace desde operacion de cocina, no desde una presentacion bonita. Prioriza velocidad de uso, trazabilidad y
                criterio de turno. Si no sirve en servicio, no se queda.
              </p>
            </article>
            <article className="rounded-3xl border border-stone-200/80 bg-white p-5 ring-1 ring-stone-100 sm:p-6">
              <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Para quien es</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-zinc-900">Equipo de cocina, encargados y duen@s</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                Ideal si quieres control operativo diario sin montar un software enterprise. Funciona para local unico y para
                quien quiere crecer por modulos sin romper la forma de trabajar.
              </p>
            </article>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-[#f8f9fb] px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl rounded-3xl border border-stone-200/80 bg-white p-5 ring-1 ring-stone-100 sm:p-6">
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">Empieza por lo que mas te duele</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-stone-200 bg-zinc-50/80 p-4">
                <p className="text-sm font-bold text-zinc-900">Si se te va el control en pedidos</p>
                <p className="mt-2 text-xs text-zinc-600">Empieza por Base (Pedidos y recepcion) y usa OCR para recortar carga manual.</p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-zinc-50/80 p-4">
                <p className="text-sm font-bold text-zinc-900">Si quieres orden y seguridad diaria</p>
                <p className="mt-2 text-xs text-zinc-600">Suma Pack Control: APPCC, Checklists y Mermas para cerrar el dia con trazabilidad.</p>
              </article>
              <article className="rounded-2xl border border-stone-200 bg-zinc-50/80 p-4">
                <p className="text-sm font-bold text-zinc-900">Si buscas rentabilidad real</p>
                <p className="mt-2 text-xs text-zinc-600">Activa Pack Gestion para inventario, escandallos y produccion con criterio economico.</p>
              </article>
            </div>
          </div>
        </section>

        <MarketingPricingConfigurator />

        <section
          id="solicitar-info"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-white px-4 py-12 sm:scroll-mt-24 sm:px-6 sm:py-16"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">¿Hablamos?</h2>
              <p className="mt-2 text-pretty text-sm leading-snug text-stone-600 sm:text-base">
                Dinos local y prioridad operativa. Te proponemos configuracion modular sin vueltas.
              </p>
            </div>

            {phoneContact ? (
              <div
                id="contacto-rapido"
                className="scroll-mt-[4.5rem] mx-auto mt-10 max-w-lg rounded-2xl border border-stone-200/80 bg-white/90 p-5 text-center shadow-[0_8px_28px_-16px_rgba(15,23,42,0.12)] ring-1 ring-stone-100 sm:scroll-mt-24 sm:p-6"
              >
                <p className="text-sm font-bold text-stone-900">Llama o escribe</p>
                <p className="mt-1 text-xs text-stone-600 sm:text-sm">Respuesta directa, con propuesta realista para tu cocina.</p>
                <MarketingContactLinkRow contact={phoneContact} className="mt-4" />
              </div>
            ) : null}

            <div className="mt-8 rounded-[1.75rem] border border-stone-200/80 bg-gradient-to-b from-[#fafafa] to-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.15)] sm:p-8">
              <div className="mx-auto max-w-lg">
                <div className="mb-6 rounded-2xl border border-stone-100 bg-white/90 px-4 py-3 text-center text-sm text-stone-600 ring-1 ring-stone-100">
                  <strong className="font-semibold text-stone-800">¿Necesitas algo a medida?</strong> Cuentalo en el mensaje:
                  ajustamos fases, packs y puesta en marcha por local.
                </div>
                <MarketingLeadForm />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-gradient-to-br from-stone-50 to-white px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl border border-stone-200/80 bg-white p-6 text-center shadow-sm ring-1 ring-stone-100 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D32F2F]/90">Cierre</p>
            <h2 className="mt-2 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
              Todo el control operativo, sin convertirlo en otro trabajo
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-stone-600 sm:text-base">
              Chef-One mantiene su esencia de cocina real y sube nivel visual, comercial y estructural para vender mejor y
              operar mas fino.
            </p>
            <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
              <Link
                href="#solicitar-info"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black text-white shadow-md transition hover:brightness-105"
                style={{ backgroundColor: BRAND }}
              >
                Pedir propuesta
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#precio"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300 bg-white px-6 text-sm font-black text-zinc-800 hover:bg-zinc-50"
              >
                Volver al configurador
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-gradient-to-br from-stone-50 to-white px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-lg font-extrabold text-stone-900 sm:text-xl">¿Ya eres cliente?</h2>
            <p className="mt-2 text-sm text-stone-600">Accede al panel con tu usuario.</p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl px-10 text-sm font-bold text-white shadow-md transition hover:brightness-105"
              style={{ backgroundColor: BRAND }}
            >
              Ir al acceso
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-[#f4f4f5] px-4 py-10 text-center sm:px-6">
        <p className="text-sm font-bold text-stone-900">Chef-One</p>
        <p className="mt-1 text-xs text-stone-500">
          Herramienta modular para hosteleria real: operacion, control y rentabilidad.
        </p>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-stone-500">
          <Link href="/login" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Acceso clientes
          </Link>
          <Link href="#precio" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Precio
          </Link>
          <Link href="#solicitar-info" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Contacto
          </Link>
          <Link href="#problema" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Problema
          </Link>
          <Link href="#diferenciales" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            OCR e IA
          </Link>
          <Link href="#modulos" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Modulos
          </Link>
          {phoneContact ? (
            <>
              <a
                href={phoneContact.telHref}
                className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
              >
                Llamar
              </a>
              <a
                href={phoneContact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
              >
                WhatsApp
              </a>
            </>
          ) : null}
        </p>
      </footer>

      <MarketingQuickContact />
    </div>
  );
}
