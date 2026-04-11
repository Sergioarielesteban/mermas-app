import Link from 'next/link';

const CREATOR_PHONE_DISPLAY = '+34 622 91 54 21';
const CREATOR_PHONE_TEL = '+34622915421';

export default function PedidosPremiaLockedScreen() {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <p className="text-sm font-black text-zinc-900">Sin acceso a este módulo</p>
      <p className="pt-2 text-sm leading-relaxed text-zinc-600">
        No tienes acceso a este módulo. Contacta con el creador: Sergio,{' '}
        <a href={`tel:${CREATOR_PHONE_TEL}`} className="font-semibold text-[#D32F2F] underline">
          {CREATOR_PHONE_DISPLAY}
        </a>
        .
      </p>
      <p className="pt-4">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700"
        >
          Volver al inicio
        </Link>
      </p>
    </section>
  );
}
