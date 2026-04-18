'use client';

import Link from 'next/link';
import { BarChart3, Receipt, Users, Wallet } from 'lucide-react';
import FinanzasDatosEntryShell from '@/components/FinanzasDatosEntryShell';

const CARDS = [
  {
    href: '/finanzas/datos/ventas',
    label: 'Ventas',
    hint: 'Cierre diario (neto)',
    Icon: BarChart3,
  },
  {
    href: '/finanzas/datos/personal',
    label: 'Coste personal',
    hint: 'Por semana o mes',
    Icon: Users,
  },
  {
    href: '/finanzas/datos/gastos-fijos',
    label: 'Gastos fijos',
    hint: 'Alta y edición',
    Icon: Wallet,
  },
  {
    href: '/finanzas/datos/impuestos',
    label: 'Impuestos',
    hint: 'IVA e IS manual',
    Icon: Receipt,
  },
] as const;

export default function FinanzasDatosHubPage() {
  return (
    <FinanzasDatosEntryShell
      title="Entrada de datos"
      description="Registra ventas, personal, gastos fijos e impuestos en pocos clics. Los datos alimentan el resumen y los agregadores existentes."
      backHref="/finanzas"
      backLabel="Resumen Finanzas"
    >
      {() => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CARDS.map(({ href, label, hint, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/40 hover:bg-red-50/30"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D32F2F]/10 text-[#D32F2F]">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-base font-black text-zinc-900">{label}</span>
                <span className="block text-sm text-zinc-600">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </FinanzasDatosEntryShell>
  );
}
