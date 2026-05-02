'use client';

import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';
import PlatoEditorForm from '@/components/servicio/PlatoEditorForm';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canManageServicioOperaciones } from '@/lib/servicio/permissions';
import type { PlatoUpsertPayload } from '@/lib/servicio/servicio-supabase';

const EMPTY: PlatoUpsertPayload = {
  nombre: '',
  slug: null,
  categoria: 'principal',
  descripcion_corta: '',
  imagen_url: null,
  raciones_base: 1,
  tiempo_total_min: 30,
  dificultad: 'facil',
  coste_por_racion: null,
  pvp_sugerido: null,
  margen_bruto: null,
  activo: true,
};

export default function ServicioPlatoNuevoPage() {
  const router = useRouter();
  const { localId, profileReady, profileRole } = useAuth();
  const canManage = canManageServicioOperaciones(profileRole);
  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    if (profileReady && !canManage) router.replace('/servicio');
  }, [profileReady, canManage, router]);

  if (!profileReady || !canManage) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">Cargando…</p>;
  }
  if (!supabase || !localId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-zinc-600">
        Supabase no disponible. No se puede crear platos.
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 pt-2 sm:px-4">
        <h1 className="text-lg font-extrabold text-zinc-900">Nuevo plato</h1>
      </div>
      <PlatoEditorForm
        supabase={supabase}
        localId={localId}
        initial={{
          plato: EMPTY,
          pasos: [],
          ingredientes: [],
          alergenos: [],
        }}
        onSaved={(id) => router.replace(`/servicio/plato/${id}`)}
        onCancel={() => router.push('/servicio')}
      />
    </div>
  );
}
