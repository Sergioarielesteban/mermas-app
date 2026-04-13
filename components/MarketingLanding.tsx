import Link from 'next/link';
import { ClipboardList, Flame, ShoppingCart, Thermometer } from 'lucide-react';

const BRAND = '#D32F2F';

const features = [
  {
    title: 'Inventario y valoración',
    body: 'Stock por local, catálogo común, cantidades con decimales y cierres mensuales con PDF.',
    Icon: ClipboardList,
  },
  {
    title: 'APPCC',
    body: 'Temperaturas de cámaras y equipos, aceite de freidoras e historial para inspecciones.',
    Icon: Thermometer,
  },
  {
    title: 'Pedidos',
    body: 'Proveedores, precios, recepción y calendario cuando tu local lo tenga activo.',
    Icon: ShoppingCart,
  },
  {
    title: 'Mermas',
    body: 'Registro rápido de mermas por motivo, coste y seguimiento del equipo.',
    Icon: Flame,
  },
] as const;

export default function MarketingLanding() {
  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-zinc-900 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Ir al contenido
      </a>

      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40">
            <img src="/logo-chef-one.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0" decoding="async" />
            <span className="text-lg font-black tracking-tight" style={{ color: BRAND }}>
              Chef-One
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
            style={{ backgroundColor: BRAND }}
          >
            Acceder
          </Link>
        </div>
      </header>

      <main id="contenido">
        <section className="relative overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-[#6b1515] px-4 pb-20 pt-12 text-white sm:pb-24 sm:pt-16">
          <div
            className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#D32F2F]/25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-200/90">Operaciones en tiempo real</p>
            <h1 className="mt-5 text-balance text-3xl font-black leading-[1.15] sm:text-5xl sm:leading-tight">
              Toda la gestión de tu cocina, en la palma de tu mano.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-zinc-300 sm:text-lg">
              Una aplicación para tu equipo: inventario valorado, mermas, APPCC y pedidos — pensada para móvil y para el
              día a día del local.
            </p>
            <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: BRAND }}
              >
                Entrar a la app
              </Link>
              <p className="text-center text-xs text-zinc-400 sm:text-left">
                ¿Ya tienes cuenta? Usa el mismo acceso en móvil o escritorio.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-xl font-black text-zinc-900 sm:text-2xl">Qué incluye Chef-One</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-zinc-600">
            Módulos que puedes usar según tu local; todo enlazado al panel de control.
          </p>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2">
            {features.map(({ title, body, Icon }) => (
              <li
                key={title}
                className="flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm ring-1 ring-zinc-100"
              >
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: BRAND }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y border-zinc-200 bg-gradient-to-br from-zinc-100 to-white px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-lg font-black text-zinc-900 sm:text-xl">¿Listo para el servicio?</h2>
            <p className="mt-2 text-sm text-zinc-600">Accede con las credenciales que te haya dado tu administrador.</p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl px-10 text-sm font-bold text-white shadow-md transition hover:brightness-110"
              style={{ backgroundColor: BRAND }}
            >
              Ir al acceso
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white px-4 py-8 text-center">
        <p className="text-sm font-semibold text-zinc-800">Chef-One</p>
        <p className="mt-1 text-xs text-zinc-500">Gestión operativa para restaurantes y cocinas centrales.</p>
        <p className="mt-4 text-[11px] text-zinc-400">
          <Link href="/login" className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700">
            Acceso usuarios
          </Link>
        </p>
      </footer>
    </div>
  );
}
