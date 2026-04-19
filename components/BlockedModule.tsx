'use client';

import { useRouter } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  Calculator,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Factory,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  UtensilsCrossed,
  Lock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getRequiredPlanForModule, type PlanModule } from '@/lib/planPermissions';

const MODULE_META: Record<PlanModule, { label: string; Icon: LucideIcon }> = {
  pedidos: { label: 'Pedidos', Icon: ShoppingCart },
  mermas: { label: 'Mermas', Icon: BookOpen },
  appcc: { label: 'APPCC', Icon: ShieldCheck },
  checklist: { label: 'Check list', Icon: ListChecks },
  inventario: { label: 'Inventario', Icon: ClipboardList },
  escandallos: { label: 'Escandallos', Icon: Calculator },
  produccion: { label: 'Produccion', Icon: Factory },
  cocina_central: { label: 'Cocina central', Icon: ChefHat },
  finanzas: { label: 'Finanzas', Icon: BarChart3 },
  personal: { label: 'Horarios', Icon: CalendarDays },
  comida_personal: { label: 'Comida de personal', Icon: UtensilsCrossed },
  chat: { label: 'Chat', Icon: MessageCircle },
};

export default function BlockedModule({ module }: { module: PlanModule }) {
  const router = useRouter();
  const meta = MODULE_META[module];
  const Icon = meta?.Icon ?? Lock;
  const label = meta?.label ?? 'Modulo';
  const requiredPlan = getRequiredPlanForModule(module);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-700">
          <Icon className="h-7 w-7" />
        </div>
        <p className="text-base font-extrabold text-zinc-900">{label}</p>
        <p className="mt-2 text-sm font-semibold text-zinc-700">Este módulo está disponible en un plan superior</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-500">Disponible en plan {requiredPlan}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/planes')}
            className="rounded-xl bg-[#D32F2F] px-4 py-2 text-sm font-bold text-white"
          >
            Ver planes
          </button>
          <button
            type="button"
            onClick={() => router.push('/planes')}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800"
          >
            Actualizar plan
          </button>
        </div>
      </div>
    </div>
  );
}
