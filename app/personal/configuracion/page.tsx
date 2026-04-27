'use client';

import MermasStyleHero from '@/components/MermasStyleHero';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import { useAuth } from '@/components/AuthProvider';

export default function PersonalConfigPage() {
  const { profileReady, profileRole } = useAuth();
  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (profileRole !== 'admin') {
    return (
      <div className="space-y-4">
        <MermasStyleHero eyebrow="Ajustes" title="Acceso restringido" compact />
        <PersonalSectionNav />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-100">
          Estas instrucciones técnicas son solo para administración del local.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Ajustes" title="Configuración básica" compact />
      <PersonalSectionNav />
      <div className="space-y-3 rounded-3xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 ring-1 ring-zinc-200">
        <p>
          <strong className="text-zinc-900">Migración:</strong> ejecuta{' '}
          <code className="rounded bg-white px-1 ring-1 ring-zinc-200">supabase-staff-attendance-schema.sql</code> en el
          SQL Editor de Supabase para crear tablas, RLS y la función de fichaje. Para solicitudes de días libres ejecuta
          también{' '}
          <code className="rounded bg-white px-1 ring-1 ring-zinc-200">supabase-staff-requests-migration.sql</code>.
          Para la tablet de fichaje por PIN:{' '}
          <code className="rounded bg-white px-1 ring-1 ring-zinc-200">supabase-staff-kiosk-resolve-pin.sql</code>.
        </p>
        <p>
          <strong className="text-zinc-900">Realtime:</strong> en el dashboard de Supabase, añade a la publicación{' '}
          <code className="rounded bg-white px-1">staff_time_entries</code>,{' '}
          <code className="rounded bg-white px-1">staff_shifts</code> y{' '}
          <code className="rounded bg-white px-1">staff_attendance_incidents</code> si quieres actualización en vivo.
        </p>
        <p>
          <strong className="text-zinc-900">Roles:</strong> <code className="rounded bg-white px-1">admin</code> gestiona
          cuadrante, equipo e incidencias. <code className="rounded bg-white px-1">manager</code> tiene vista operativa de
          horarios sin gestión de equipo. <code className="rounded bg-white px-1">staff</code> fichar y ver su registro.
        </p>
        <p>
          <strong className="text-zinc-900">Vincular usuario:</strong> en la tabla{' '}
          <code className="rounded bg-white px-1">staff_employees</code>, asigna <code className="rounded bg-white px-1">user_id</code>{' '}
          al UUID de Auth del empleado para que al entrar vea su fichaje sin elegir a otra persona.
        </p>
        <p className="text-xs text-zinc-500">
          Próximos pasos sugeridos: geolocalización opcional en fichajes, informes exportables, generación automática de
          incidencias por comparación plan vs real, y tolerancias configurables por local.
        </p>
      </div>
    </div>
  );
}
