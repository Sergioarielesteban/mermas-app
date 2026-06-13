import Link from 'next/link';
import { APP_MODULE_HOME_PATH } from '@/lib/module-config';

export default function ModuleUnavailableScreen({ moduleName }: { moduleName?: string }) {
  return (
    <section className="mx-auto flex min-h-[55dvh] w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-6 shadow-sm ring-1 ring-zinc-100">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#B91C1C]">
          Chef One V1
        </p>
        <h1 className="mt-2 text-xl font-black tracking-tight text-zinc-950">
          Módulo no disponible en esta versión
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          {moduleName
            ? `${moduleName} está oculto para la primera versión pública.`
            : 'Este módulo está oculto para la primera versión pública.'}
        </p>
        <Link
          href={APP_MODULE_HOME_PATH}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#D32F2F] px-5 text-sm font-bold text-white shadow-sm shadow-red-900/10"
        >
          Volver al panel
        </Link>
      </div>
    </section>
  );
}
