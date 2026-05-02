'use client';

import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { ccFetchBatchByQrToken } from '@/lib/cocina-central-supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

const MSG_NO_TOKEN = 'Acceso no válido. Falta el token de seguridad en el enlace.';

/**
 * Compatibilidad: enlaces antiguos solo con ?token=
 * Redirige a /cocina-central/lote/[id]?token=…
 * Sin token: no se muestra ficha.
 */
function LegacyTokenOnlyBody() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token')?.trim() ?? '';
  const { profileReady } = useAuth();
  const supabase = getSupabaseClient();
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase || !token) return;
    let cancelled = false;
    setWorking(true);
    setErr(null);
    void (async () => {
      try {
        const b = await ccFetchBatchByQrToken(supabase, token);
        if (cancelled) return;
        if (b) {
          router.replace(`/cocina-central/lote/${b.id}?token=${encodeURIComponent(token)}`);
          return;
        }
        setErr('Acceso no válido.');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error al validar el enlace');
      } finally {
        if (!cancelled) setWorking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, token, router]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-zinc-600">Conexión no disponible.</p>;
  }

  if (!token) {
    return (
      <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
        <p className="font-semibold text-zinc-900">{MSG_NO_TOKEN}</p>
        <p className="text-xs text-zinc-600">
          Escanea de nuevo el QR de la etiqueta o abre un enlace que incluya el parámetro{' '}
          <code className="rounded bg-zinc-200 px-1">token</code>.
        </p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
        <p className="font-semibold text-zinc-900">{err}</p>
        <p className="text-xs text-zinc-600">Comprueba que el código no esté dañado o genera otra vez la etiqueta del lote.</p>
      </div>
    );
  }

  return <p className="text-sm text-zinc-500">{working ? 'Validando enlace del lote…' : 'Redirigiendo…'}</p>;
}

export default function CocinaCentralLoteLegacyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <LegacyTokenOnlyBody />
    </Suspense>
  );
}
