import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Flame,
  Smartphone,
  ShoppingCart,
  Sparkles,
  Thermometer,
  Users,
} from 'lucide-react';
import ChefOneLaunchMark from '@/components/ChefOneLaunchMark';
import MarketingLeadForm from '@/components/MarketingLeadForm';

const BRAND = '#D32F2F';

const pains = [
  'Nadie del equipo sabe con claridad qué se ha pedido a proveedores y qué falta por llegar.',
  'Cuando el jefe de cocina no está, los pedidos y las incidencias se pierden en grupos de WhatsApp o en papeles.',
  'Llegan productos equivocados o en mal estado y no queda registro claro de quién avisó y cuándo.',
  'Las mermas y lo que se tira a basura no se mide: al final del mes el coste es una sorpresa.',
  'Los puntos críticos (temperaturas, freidoras…) dependen de cuadernos que no siempre se rellenan.',
];

const solutions = [
  'Pedidos y recepción visibles para el equipo: menos “¿esto lo pedimos?” y más trazabilidad.',
  'Mermas y residuos registrados en segundos desde el móvil, con motivo y coste.',
  'APPCC e inventario en la misma herramienta que el dueño y el jefe de cocina pueden consultar.',
  'Funciona en móvil y tablet en cocina; el equipo sigue un mismo guion aunque cambien los turnos.',
];

const modules = [
  {
    title: 'Pedidos y recepción',
    body: 'Lo que pides, lo que llega y la problemática del día a día concentrada en un solo sitio — no dispersa en chats.',
    Icon: ShoppingCart,
  },
  {
    title: 'Mermas y residuos',
    body: 'Control de lo que se tira, por qué y cuánto cuesta. La parte que muchos locales menos controlan, aquí queda registrada.',
    Icon: Flame,
  },
  {
    title: 'Puntos críticos (APPCC)',
    body: 'Temperaturas, aceite de freidoras e historial para inspecciones — menos papeleo y más constancia.',
    Icon: Thermometer,
  },
  {
    title: 'Inventario y valoración',
    body: 'Stock por local, cierres mensuales y visibilidad del valor que tienes en almacén y cocina.',
    Icon: ClipboardList,
  },
] as const;

export default function MarketingLanding() {
  return (
    <div className="min-h-[100dvh] bg-[#fefcfb] text-stone-800">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-stone-800 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Ir al contenido
      </a>

      <header className="sticky top-0 z-50 border-b border-stone-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
              href="#solicitar-info"
              className="hidden rounded-full px-3 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 sm:inline-flex"
            >
              Solicitar info
            </Link>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
            >
              Acceder
            </Link>
          </div>
        </div>
      </header>

      <main id="contenido">
        {/* Hero: cálido, logo grande centrado */}
        <section className="relative overflow-hidden border-b border-rose-100/80 bg-gradient-to-b from-[#fff8f6] via-[#fff5f3] to-[#ffeae8] px-4 pb-16 pt-10 sm:pb-20 sm:pt-14">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-96 w-[120%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,_rgba(211,47,47,0.12)_0%,_transparent_65%)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mx-auto flex justify-center">
              <ChefOneLaunchMark
                boxClassName="border-stone-200/90 bg-white shadow-md shadow-rose-100/50"
                imgClassName="mx-auto block w-[min(92vw,480px)] max-w-full select-none"
                lineClassName="mt-6 w-full max-w-[min(88vw,380px)]"
              />
            </div>
            <p className="mt-8 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-rose-100">
              <span className="tabular-nums" style={{ color: BRAND }}>
                Menos de 10 €/semana
              </span>
              <span className="text-stone-300">·</span>
              <span className="tabular-nums text-stone-800">39,90 €/mes</span>
              <span className="hidden font-normal text-stone-500 sm:inline">— mismo precio, todo el equipo</span>
            </p>
            <h1 className="mt-8 text-balance text-2xl font-bold leading-snug text-stone-800 sm:text-4xl sm:leading-tight">
              La cocina es lo que menos se controla.{' '}
              <span className="font-black" style={{ color: BRAND }}>
                Chef-One
              </span>{' '}
              te ayuda a hacerlo fácil y rápido.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-stone-600 sm:text-lg">
              Una aplicación para{' '}
              <strong className="font-semibold text-stone-800">pedidos, mermas, residuos, puntos críticos e inventario</strong>
              . Menos información perdida entre proveedores, WhatsApp y cuadernos — más claridad para el jefe de cocina y
              el dueño.
            </p>
            <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Link
                href="#solicitar-info"
                className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: BRAND }}
              >
                Solicitar información
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-stone-700 ring-2 ring-stone-200 transition hover:bg-white/80"
              >
                Ya soy cliente — acceder
              </Link>
            </div>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-stone-500">
              <Smartphone className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
              Móvil o tablet en cocina · Varios perfiles para guiar al equipo
            </p>
          </div>
        </section>

        {/* Problema */}
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50/80 px-4 py-3 ring-1 ring-amber-100 sm:px-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <p className="text-sm leading-relaxed text-amber-950 sm:text-base">
              <strong className="font-bold">¿Te suena?</strong> La problemática de la recepción de pedidos — qué se pidió,
              qué falta, errores de proveedor sin quien avise — hace que se pierda dinero y tiempo todos los días.
            </p>
          </div>
          <h2 className="mt-14 text-center text-xl font-black text-stone-800 sm:text-2xl">
            Lo que suele fallar cuando nadie centraliza la información
          </h2>
          <ul className="mx-auto mt-8 max-w-2xl space-y-3">
            {pains.map((text) => (
              <li
                key={text.slice(0, 40)}
                className="flex gap-3 rounded-xl border border-stone-200/80 bg-white px-4 py-3 text-sm leading-relaxed text-stone-700 shadow-sm"
              >
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </section>

        {/* Solución */}
        <section className="border-y border-rose-100/90 bg-gradient-to-br from-white to-[#fff5f4] px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-xl font-black text-stone-800 sm:text-2xl">
              Toda esa información, en una sola aplicación
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-stone-600 sm:text-base">
              Por <strong className="text-stone-800">39,90 € al mes</strong> (menos de lo que muchos locales gastan en un
              solo día de mermas no controladas) tienes una herramienta pensada para{' '}
              <strong className="text-stone-800">cocina y operaciones</strong>, no solo para el despacho.
            </p>
            <ul className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
              {solutions.map((text) => (
                <li key={text.slice(0, 36)} className="flex gap-3 rounded-2xl bg-white/90 p-4 ring-1 ring-rose-100/80">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="text-sm leading-relaxed text-stone-700">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-rose-900/95 to-[#8b2e2e] px-5 py-5 text-center text-white shadow-lg shadow-rose-900/15 sm:flex-row sm:justify-center sm:gap-4 sm:text-left">
              <Users className="h-8 w-8 shrink-0 text-rose-100" aria-hidden />
              <p className="text-sm leading-relaxed text-rose-50">
                <strong className="font-bold text-white">Dueño y jefe de cocina</strong> ven lo mismo: pueden guiar al
                equipo con datos, no solo con reuniones a fin de mes.
              </p>
            </div>
          </div>
        </section>

        {/* Módulos */}
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-center text-xl font-black text-stone-800 sm:text-2xl">Qué cubre hoy Chef-One</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-stone-600">
            Especialmente la parte operativa de cocina: lo que la gente <em>menos</em> mide y <em>más</em> impacta al
            margen. Escandallos y cocina central van ampliando el producto; lo core ya está en marcha en locales reales.
          </p>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2">
            {modules.map(({ title, body, Icon }) => (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm ring-1 ring-stone-100"
              >
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                  style={{ backgroundColor: BRAND }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-stone-200/90 bg-gradient-to-br from-stone-50 to-white px-5 py-6 shadow-sm ring-1 ring-stone-100 sm:px-6 sm:py-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: BRAND }}
                aria-hidden
              >
                <Sparkles className="h-6 w-6" strokeWidth={2} />
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <h3 className="text-base font-black text-stone-900 sm:text-lg">
                  ¿Necesitas un módulo especial o medir algo que aún no está en la app?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">
                  Si tu cocina o tu cadena necesita un flujo distinto, un registro concreto o{' '}
                  <strong className="font-semibold text-stone-800">medir un indicador que hoy no cubrimos</strong>, lo
                  podemos plantear <strong className="font-semibold text-stone-800">a medida</strong>: lo hablamos,
                  priorizamos contigo y te proponemos cómo encajarlo.
                </p>
                <Link
                  href="#solicitar-info"
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: BRAND }}
                >
                  Contarnos qué necesitas
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Precio + lead */}
        <section id="solicitar-info" className="scroll-mt-20 border-t border-rose-100 bg-white px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-xl font-black text-stone-800 sm:text-2xl">Precio claro, sin sorpresas</h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 sm:text-base">
                <strong className="text-stone-900">39,90 €/mes</strong> por local (orientativo; confirma condiciones al
                hablar con nosotros). Equivale a <strong className="text-stone-900">menos de 10 € a la semana</strong> para
                tener pedidos, mermas, APPCC e inventario accesibles desde cualquier móvil o tablet.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                Si quieres ver cómo encaja en tu restaurante, déjanos tus datos. Te explicamos el onboarding y qué módulos
                activar primero según tu tipo de cocina.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-stone-600">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  Respuesta humana, sin formularios eternos que nadie lee.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  Puedes seguir usando la demo o acceso de prueba si ya lo tienes.
                </li>
              </ul>
            </div>
            <div className="rounded-3xl border border-stone-200 bg-gradient-to-b from-white to-[#fffafa] p-6 shadow-md ring-1 ring-rose-50 sm:p-8">
              <h3 className="text-lg font-bold text-stone-900">Déjanos tus datos</h3>
              <p className="mt-1 text-sm text-stone-600">Te contactamos para una llamada corta o un email con próximos pasos.</p>
              <div className="mt-6">
                <MarketingLeadForm />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[#fff5f3] to-white px-4 py-12 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-lg font-bold text-stone-800 sm:text-xl">¿Ya tienes cuenta en Chef-One?</h2>
            <p className="mt-2 text-sm text-stone-600">Entra con el usuario que te haya dado tu administrador.</p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl px-10 text-sm font-bold text-white shadow-md transition hover:brightness-110"
              style={{ backgroundColor: BRAND }}
            >
              Ir al acceso
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-[#faf9f8] px-4 py-8 text-center">
        <p className="text-sm font-semibold text-stone-800">Chef-One</p>
        <p className="mt-1 text-xs text-stone-500">Operaciones de cocina y restaurante, sin perder el hilo.</p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-stone-400">
          <Link href="/login" className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700">
            Acceso clientes
          </Link>
          <Link href="#solicitar-info" className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700">
            Solicitar información
          </Link>
        </p>
      </footer>
    </div>
  );
}
