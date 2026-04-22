'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import PlatoEditorForm from '@/components/servicio/PlatoEditorForm';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { canManageServicioOperaciones } from '@/lib/servicio/permissions';
import { dateKeyLocal } from '@/lib/servicio/date-key';
import type { PlatoUpsertPayload, ServicioIngredienteInput, ServicioPasoInput } from '@/lib/servicio/servicio-supabase';
import {
  fetchPlatoForEditor,
  platoRowToUpsertPayload,
  softDeletePlato,
} from '@/lib/servicio/servicio-supabase';
import type { AllergenKey } from '@/lib/servicio/types';

type EditorInitial = {
  plato: PlatoUpsertPayload;
  pasos: ServicioPasoInput[];
  ingredientes: ServicioIngredienteInput[];
  alergenos: AllergenKey[];
};

export default function ServicioPlatoEditarPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { localId, profileReady, profileRole } = useAuth();
  const canManage = canManageServicioOperaciones(profileRole);
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<EditorInitial | null>(null);

  useEffect(() => {
    if (profileReady && !canManage) router.replace('/servicio');
  }, [profileReady, canManage, router]);

  useEffect(() => {
    if (!profileReady || !canManage || !supabase || !localId || !id) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchPlatoForEditor(supabase, localId, id);
      if (cancelled) return;
      if (!data) {
        setInitial(null);
        setReady(true);
        return;
      }
      setInitial({
        plato: platoRowToUpsertPayload(data.plato),
        pasos: data.pasos,
        ingredientes: data.ingredientes,
        alergenos: data.alergenos,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileReady, canManage, supabase, localId, id]);

  const onDelete = async () => {
    if (!supabase || !localId || !id) return;
    if (!window.confirm('¿Archivar este plato? Dejará de mostrarse en el catálogo activo.')) return;
    const from = dateKeyLocal(new Date());
    const r = await softDeletePlato(supabase, localId, id, from);
    if (!r.ok) {
      window.alert(r.message);
      return;
    }
    router.replace('/servicio');
  };

  if (!profileReady || !canManage) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">Cargando…</p>;
  }
  if (!supabase || !localId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-zinc-600">
        Supabase no disponible.
        <Link href="/servicio" className="mt-4 block font-extrabold text-[#B91C1C]">
          Volver
        </Link>
      </div>
    );
  }

  if (!ready) {
    return <p className="px-4 py-10 text-center text-sm text-zinc-500">Cargando plato…</p>;
  }
  if (!initial) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-zinc-600">Plato no encontrado.</p>
        <Link href="/servicio" className="mt-4 inline-block font-extrabold text-[#B91C1C]">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 pt-2 sm:px-4">
        <Link
          href={`/servicio/plato/${id}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 text-lg font-extrabold text-zinc-900">Editar plato</h1>
      </div>
      <div className="mx-auto max-w-lg px-3 pb-2 sm:px-4">
        <button
          type="button"
          onClick={() => void onDelete()}
          className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-extrabold text-rose-900"
        >
          Archivar plato
        </button>
      </div>
      <PlatoEditorForm
        supabase={supabase}
        localId={localId}
        platoId={id}
        initial={initial}
        onSaved={() => router.replace(`/servicio/plato/${id}`)}
        onCancel={() => router.push(`/servicio/plato/${id}`)}
      />
    </div>
  );
}
