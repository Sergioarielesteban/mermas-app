'use client';

import Link from 'next/link';
import { BrushCleaning, Droplet, Tags, Thermometer } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';

type ModuleCardProps = {
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  sub: string;
};

function ModuleMainCard({ href, Icon, label, sub }: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200/90 bg-white px-6 py-7 shadow-sm ring-1 ring-zinc-100 transition hover:shadow-md hover:ring-zinc-200 active:scale-[0.98]"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D32F2F]/10 shadow-inner">
        <Icon className="h-8 w-8 text-[#D32F2F]" strokeWidth={2} />
      </div>
      <div className="text-center">
        <p className="text-base font-bold text-zinc-900">{label}</p>
        <p className="mt-0.5 text-[12px] font-medium text-zinc-400">{sub}</p>
      </div>
    </Link>
  );
}

export default function AppccHubPage() {
  const { profileRole } = useAuth();
  const isManager = profileRole === 'manager';

  return (
    <div className="space-y-3">
      <MermasStyleHero slim compactTitle eyebrow="APPCC" title="Puntos críticos y control diario" />

      <ModuleMainCard
        href="/appcc/temperaturas"
        Icon={Thermometer}
        label="Registrar temperaturas"
        sub="Mañana y noche · por sector"
      />

      <ModuleMainCard
        href="/appcc/aceite/registro"
        Icon={Droplet}
        label="Cambios de aceite"
        sub="Filtrado o cambio por freidora"
      />

      <ModuleMainCard
        href={isManager ? '/appcc/carta-alergenos/matriz' : '/appcc/carta-alergenos'}
        Icon={Tags}
        label="Carta y alérgenos"
        sub={isManager ? 'Matriz de consulta' : 'Estados, revisión y trazabilidad'}
      />

      <ModuleMainCard
        href="/appcc/limpieza/registro"
        Icon={BrushCleaning}
        label="Limpieza y mantenimiento"
        sub="Mañana y noche por tarea"
      />
    </div>
  );
}
