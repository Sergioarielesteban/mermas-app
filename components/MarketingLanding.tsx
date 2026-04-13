import Link from 'next/link';
import { ShieldCheck, TrendingUp, Eye, Layers } from 'lucide-react';
import MarketingLeadForm from '@/components/MarketingLeadForm';
import MarketingHero from '@/components/marketing/MarketingHero';
import MarketingModulesSection from '@/components/marketing/MarketingModulesSection';

const BRAND = '#D32F2F';

const benefitBlocks = [
  {
    title: 'Menos errores',
    body: 'Pedidos y recepción con registro claro. Menos “¿esto lo pedimos?” y menos incidencias sin dueño.',
    Icon: ShieldCheck,
    accent: 'from-rose-50 to-white ring-rose-100/80',
  },
  {
    title: 'Menos información perdida',
    body: 'Lo importante deja de vivir solo en WhatsApp o en el cuaderno del turno.',
    Icon: Layers,
    accent: 'from-sky-50/80 to-white ring-sky-100/70',
  },
  {
    title: 'Más control operativo',
    body: 'Dueño y jefe de cocina pueden guiar con datos visibles, no solo con reuniones a final de mes.',
    Icon: Eye,
    accent: 'from-violet-50/70 to-white ring-violet-100/70',
  },
  {
    title: 'Más rentabilidad',
    body: 'Mermas medidas, stock más claro y base para escandallos: decisiones con mejor foto del negocio.',
    Icon: TrendingUp,
    accent: 'from-emerald-50/90 to-white ring-emerald-100/80',
  },
] as const;

export default function MarketingLanding() {
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
              href="#modulos"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Módulos
            </Link>
            <Link
              href="#solicitar-info"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200/90 transition hover:bg-stone-50 sm:inline-flex"
            >
              Solicitar info
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
        <MarketingModulesSection />

        {/* Beneficios */}
        <section className="border-t border-stone-200/60 bg-white px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="beneficios-heading">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="beneficios-heading" className="text-balance text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Por qué importa en hostelería real
              </h2>
              <p className="mt-3 text-pretty text-sm text-stone-600 sm:text-base">
                Sin humo: lo que cambia en el día a día cuando la operación deja de estar repartida entre chats y papeles.
              </p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {benefitBlocks.map(({ title, body, Icon, accent }) => (
                <li
                  key={title}
                  className={`relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br p-6 shadow-[0_4px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ${accent}`}
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
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Precio */}
        <section className="border-t border-stone-200/60 bg-gradient-to-b from-[#f8f9fb] to-white px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="precio-heading">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="precio-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Precio claro por local
            </h2>
            <div className="relative mt-10 overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white p-8 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.2)] ring-1 ring-white sm:p-10">
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#D32F2F]/[0.07]"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-stone-900/[0.04]"
                aria-hidden
              />
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Desde</p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight text-stone-900 sm:text-6xl">
                39,90&nbsp;€
                <span className="text-2xl font-bold text-stone-500 sm:text-3xl">/mes</span>
              </p>
              <p className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200/80">
                Menos de 10&nbsp;€ a la semana por local
              </p>
              <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-stone-600">
                Un único precio orientativo para tener el núcleo operativo en móvil o tablet. Confirma condiciones al
                hablar con nosotros según tu tipo de negocio.
              </p>
              <Link
                href="#solicitar-info"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl px-10 text-sm font-bold text-white shadow-lg transition hover:brightness-105"
                style={{ backgroundColor: BRAND }}
              >
                Solicitar información
              </Link>
            </div>
          </div>
        </section>

        {/* A medida + formulario */}
        <section
          id="solicitar-info"
          className="scroll-mt-[4.5rem] border-t border-stone-200/60 bg-white px-4 py-16 sm:scroll-mt-24 sm:px-6 sm:py-24"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">Hablemos de tu cocina</h2>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-stone-600 sm:text-base">
                Cuéntanos tu local y qué quieres ordenar primero. Respondemos en persona: sin formularios eternos que
                nadie lee.
              </p>
            </div>

            <div className="mt-10 rounded-[1.75rem] border border-stone-200/80 bg-gradient-to-b from-[#fafafa] to-white p-6 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.15)] sm:p-10">
              <div className="mx-auto max-w-lg">
                <div className="mb-8 rounded-2xl border border-stone-100 bg-white/90 px-4 py-3.5 text-center text-sm text-stone-600 ring-1 ring-stone-100 sm:px-5">
                  <strong className="font-semibold text-stone-800">¿Módulo especial o medir algo distinto?</strong>{' '}
                  Lo podemos plantear a medida; indícalo en el mensaje.
                </div>
                <MarketingLeadForm />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200/60 bg-gradient-to-br from-stone-50 to-white px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-lg font-bold text-stone-900 sm:text-xl">¿Ya eres cliente?</h2>
            <p className="mt-2 text-sm text-stone-600">Entra con el usuario que te haya dado tu administrador.</p>
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
        <p className="mt-1 text-xs text-stone-500">Operaciones de cocina y restaurante, sin perder el hilo.</p>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-stone-500">
          <Link href="/login" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Acceso clientes
          </Link>
          <Link href="#solicitar-info" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Solicitar información
          </Link>
          <Link href="#modulos" className="font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            Ver módulos
          </Link>
        </p>
      </footer>
    </div>
  );
}
