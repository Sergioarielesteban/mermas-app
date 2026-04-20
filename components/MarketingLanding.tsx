import Link from 'next/link';
import { GaugeCircle, Layers, ShieldCheck, Workflow } from 'lucide-react';
import MarketingLeadForm from '@/components/MarketingLeadForm';
import MarketingQuickContact, { MarketingContactLinkRow } from '@/components/marketing/MarketingQuickContact';
import MarketingHero from '@/components/marketing/MarketingHero';
import MarketingModulesSection from '@/components/marketing/MarketingModulesSection';
import MarketingPricingHighlight from '@/components/marketing/MarketingPricingHighlight';
import StoreDownloadBadges from '@/components/marketing/StoreDownloadBadges';
import { getMarketingContactPhone } from '@/lib/marketing-contact-phone';

const BRAND = '#D32F2F';

const socialProofClients = [
  'La Barra Norte',
  'Fuego y Sal',
  'Casa Mercado',
  'Bistró Central',
  'Taberna 23',
  'Costa Brasa',
  'La Sartén Roja',
  'Punto y Fondo',
] as const;

const problemPoints = [
  'No sabes exactamente qué se ha pedido.',
  'Los precios cambian y nadie lo detecta.',
  'Cada turno trabaja distinto.',
  'Se pierde información entre cocina y sala.',
  'No tienes una visión clara del negocio.',
] as const;

const realUseCards = [
  'Turno de mañana publica checklist y deja todo trazado para noche.',
  'Recepción detecta subida de coste al validar albarán.',
  'Encargado revisa mermas del día antes de volver a pedir.',
  'Auditoría APPCC con registros listos en minutos.',
  'Cambio de personal sin perder procesos ni contexto.',
  'Cierre semanal con datos de coste y consumo interno claros.',
] as const;

const benefitBlocks = [
  {
    title: 'Sistema único',
    body: 'Operación, control y cumplimiento en el mismo flujo.',
    Icon: ShieldCheck,
    accent: 'from-rose-50 to-white ring-rose-100/80',
  },
  {
    title: 'Decisión con datos',
    body: 'Métricas operativas para decidir en servicio y en cierre.',
    Icon: Layers,
    accent: 'from-sky-50/80 to-white ring-sky-100/70',
  },
  {
    title: 'Flujo replicable',
    body: 'Cada turno trabaja igual, con menos dependencia de memoria.',
    Icon: Workflow,
    accent: 'from-violet-50/70 to-white ring-violet-100/70',
  },
  {
    title: 'Velocidad real',
    body: 'Uso rápido en móvil para que se use durante el servicio.',
    Icon: GaugeCircle,
    accent: 'from-emerald-50/90 to-white ring-emerald-100/80',
  },
] as const;

export default function MarketingLanding() {
  const phoneContact = getMarketingContactPhone();

  return (
    <div className="min-h-[100dvh] scroll-smooth bg-[#f8f9fb] text-stone-800 antialiased">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Ir al contenido
      </a>

      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5 sm:gap-3 sm:px-6 sm:py-6">
          <div className="min-w-0" aria-hidden />
          <Link
            href="/"
            className="flex justify-self-center outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/35"
          >
            <img
              src="/logo-chef-one.svg"
              alt="Chef-One"
              width={48}
              height={48}
              className="h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 sm:h-12 sm:w-12 sm:min-h-[48px] sm:min-w-[48px]"
              decoding="async"
            />
          </Link>
          <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2.5" aria-label="Principal">
            <Link
              href="#problema"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 md:inline-flex"
            >
              Por qué funciona
            </Link>
            <Link
              href="#modulos"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 md:inline-flex"
            >
              Módulos
            </Link>
            <Link
              href="#precio"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 md:inline-flex"
            >
              Planes
            </Link>
            <Link
              href="#solicitar-info"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 md:inline-flex"
            >
              Contacto
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-900/15 transition hover:brightness-105 active:scale-[0.98] sm:min-h-11 sm:px-5 sm:text-sm"
              style={{ backgroundColor: BRAND }}
            >
              Acceder
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenido">
        <MarketingHero />
        <section className="overflow-hidden border-b border-stone-200/60 bg-white py-4">
          <div className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden">
              <div className="flex min-w-max animate-[chefone-marquee_28s_linear_infinite] gap-3 px-4 sm:px-6">
                {[...socialProofClients, ...socialProofClients].map((name, idx) => (
                  <span
                    key={`${name}-${idx}`}
                    className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="problema" className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-white px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
              Si esto te suena, lo necesitas
            </h2>
            <ul className="mx-auto mt-8 grid max-w-2xl justify-items-center gap-3 sm:mt-10 sm:grid-cols-2 sm:justify-items-stretch sm:gap-4">
              {problemPoints.map((point) => (
                <li
                  key={point}
                  className="w-full max-w-md rounded-xl border border-stone-200 bg-stone-50/90 px-4 py-3.5 text-center text-sm font-medium leading-snug text-stone-700 shadow-sm sm:max-w-none sm:text-left"
                >
                  {point}
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-pretty text-sm font-semibold text-stone-900 sm:mt-10">
              Y cuando algo falla, nadie sabe por qué.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-pretty text-sm font-semibold text-[#D32F2F]">
              Chef-One organiza todo eso en un solo sistema.
            </p>
          </div>
        </section>

        <MarketingModulesSection />

        <section
          id="identidad"
          className="border-t border-stone-200/60 bg-[#f0f1f4] px-4 py-16 sm:px-6 sm:py-20"
          aria-labelledby="identidad-heading"
        >
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-stone-200/90 bg-white px-6 py-12 text-center shadow-[0_20px_50px_-24px_rgba(0,0,0,0.08)] sm:px-10 sm:py-14">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D32F2F]/90">Identidad</p>
              <h2
                id="identidad-heading"
                className="mt-4 text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl"
              >
                Pensado entre servicio y servicio
              </h2>
              <p className="mt-6 text-balance text-lg font-bold leading-snug text-stone-900 sm:text-xl">
                Chef-One no nace en una oficina. Nace en una cocina.
              </p>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-stone-600 sm:text-base">
                Nace de una necesidad operativa clara: dar orden a la información, a los procesos y a la ejecución
                durante el servicio. Está pensado para cocina real (ritmo, claridad y criterio), no para sumar
                burocracia al equipo.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-gradient-to-b from-white to-[#f8f9fb] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">Uso real en cocina</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {realUseCards.map((item) => (
                <article key={item} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-700 shadow-sm">
                  {item}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Beneficios */}
        <section className="border-t border-stone-200/60 bg-white px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="beneficios-heading">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="beneficios-heading" className="text-balance text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
                Beneficios del sistema
              </h2>
              <p className="mt-2 text-pretty text-sm text-stone-600 sm:text-base">
                Menos fricción operativa, más consistencia.
              </p>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {benefitBlocks.map(({ title, body, Icon, accent }) => (
                <li
                  key={title}
                  className={`relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br p-5 shadow-[0_4px_24px_-12px_rgba(15,23,42,0.12)] ring-1 sm:p-6 ${accent}`}
                >
                  <div
                    className="mb-4 grid h-11 w-11 place-items-center rounded-xl text-white shadow-md"
                    style={{
                      background: `linear-gradient(145deg, ${BRAND} 0%, #9a1818 100%)`,
                    }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="text-base font-bold text-stone-900">{title}</h3>
                  <p className="mt-2 text-sm leading-snug text-stone-600">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-stone-50/80 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">Activación simple desde el día uno</h2>
            <p className="mt-3 text-sm text-stone-600 sm:text-base">
              Empiezas en móvil, activas lo necesario y gestionas el local sin depender de soporte continuo.
            </p>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">Hecho para ir rápido</h2>
            <ul className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
              <li className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">Registrar en segundos.</li>
              <li className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">Usable en pleno servicio.</li>
              <li className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">Sin formación compleja.</li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-stone-900">Si no es rápido, no se usa.</p>
          </div>
        </section>

        <MarketingPricingHighlight />

        {/* A medida + formulario */}
        <section
          id="solicitar-info"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-[#fafbfc] px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-20"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">¿Hablamos?</h2>
              <p className="mt-2 text-pretty text-sm leading-snug text-stone-600 sm:text-base">
                Cuéntanos tu cocina y te enseñamos cómo activarla sin fricción.
              </p>
            </div>

            {phoneContact ? (
              <div
                id="contacto-rapido"
                className="scroll-mt-[4.5rem] mx-auto mt-10 max-w-lg rounded-2xl border border-stone-200/80 bg-white/90 p-5 text-center shadow-[0_8px_28px_-16px_rgba(15,23,42,0.12)] ring-1 ring-stone-100 sm:scroll-mt-24 sm:p-6"
              >
                <p className="text-sm font-bold text-stone-900">Llama o escribe</p>
                <p className="mt-1 text-xs text-stone-600 sm:text-sm">Un toque y listo.</p>
                <MarketingContactLinkRow contact={phoneContact} className="mt-4" />
              </div>
            ) : null}

            <div className="mt-8 rounded-[1.75rem] border border-stone-200/80 bg-gradient-to-b from-[#fafafa] to-white p-5 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.15)] sm:p-8">
              <div className="mx-auto max-w-lg">
                <div className="mb-6 rounded-2xl border border-stone-100 bg-white/90 px-4 py-3 text-center text-sm text-stone-600 ring-1 ring-stone-100">
                  <strong className="font-semibold text-stone-800">¿Algo a medida?</strong> Dilo en el mensaje: ajustamos
                  módulos a tu operación.
                </div>
                <MarketingLeadForm />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-gradient-to-br from-stone-50 to-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold text-stone-900 sm:text-3xl">Empieza a operar con sistema hoy</h2>
            <p className="mt-2 text-sm text-stone-600">Pide demo, activa plan y arranca sin permanencia.</p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="#solicitar-info"
                className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                style={{ backgroundColor: BRAND }}
              >
                Solicitar demo
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-stone-300 px-8 text-sm font-bold text-stone-800 transition hover:bg-stone-100"
              >
                Abrir app
              </Link>
            </div>
            <StoreDownloadBadges className="mt-10" />
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-[#f4f4f5] px-4 py-10 text-center sm:px-6">
        <p className="text-sm font-bold text-stone-900">Chef-One</p>
        <p className="mt-1 text-xs text-stone-500">
          Para equipos de cocina y profesionales del sector. Sin perder el hilo.
        </p>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-stone-500">
          <Link href="#problema" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Por qué funciona
          </Link>
          <Link href="#modulos" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Módulos
          </Link>
          <Link href="#precio" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Planes
          </Link>
          <Link href="#solicitar-info" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Contacto
          </Link>
          <Link href="/login" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Acceso clientes
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
