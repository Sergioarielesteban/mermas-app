'use client';

import Link from 'next/link';
import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';

type Props = {
  title?: string;
  message: string;
  backHref?: string;
  backLabel?: string;
};

export function PersonalRouteBlocked({
  title = 'Acceso no autorizado',
  message,
  backHref = '/personal',
  backLabel = 'Volver al resumen de Horarios y fichajes',
}: Props) {
  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Personal" title={title} compact />
      <PersonalSectionNav />
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-100">
        {message}
      </section>
      <Link href={backHref} className="inline-flex text-sm font-bold text-[#D32F2F] underline underline-offset-2">
        {backLabel}
      </Link>
    </div>
  );
}
