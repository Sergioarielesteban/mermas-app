'use client';

import { CocinaCentralModulePinGate } from '@/components/cocina-central/CocinaCentralModulePinGate';
import { useAuth } from '@/components/AuthProvider';
import { canAccessCocinaCentralModule } from '@/lib/cocina-central-permissions';

export default function CocinaCentralLayout({ children }: { children: React.ReactNode }) {
  const { profileReady, profileRole } = useAuth();

  if (!profileReady) {
    return <p className="text-center text-sm text-zinc-500">Cargando perfil…</p>;
  }

  if (!canAccessCocinaCentralModule(profileRole)) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-1 py-2">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
          <p className="font-extrabold text-zinc-900">Cocina central</p>
          <p className="mt-2 leading-snug text-zinc-700">
            Este apartado solo está disponible para perfiles <strong>administrador</strong> o{' '}
            <strong>encargado</strong> (<code className="text-xs">manager</code>). Los usuarios{' '}
            <code className="text-xs">staff</code> no tienen acceso.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Para cambiar el rol: Supabase → tabla <code className="text-xs">profiles</code> → columna{' '}
            <code className="text-xs">role</code>.
          </p>
        </div>
      </div>
    );
  }

  return <CocinaCentralModulePinGate>{children}</CocinaCentralModulePinGate>;
}
