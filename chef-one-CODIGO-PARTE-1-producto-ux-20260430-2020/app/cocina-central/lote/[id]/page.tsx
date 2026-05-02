'use client';

import LoteQrFichaContent from '@/components/cocina-central/LoteQrFichaContent';
import { batchQrTokensMatch } from '@/lib/cocina-central-qr';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { ccFetchBatchById } from '@/lib/cocina-central-supabase';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

const MSG_NO_TOKEN = 'Acceso no válido. Falta el token de seguridad en el enlace.';
const MSG_BAD_TOKEN = 'Token incorrecto. No se puede abrir este lote.';
const MSG_DENIED = 'Acceso no válido.';

function LoteByIdBody() {
  const params = useParams();
  const searchParams = useSearchParams();
  const batchId = String(params.id ?? '').trim();
  const token = searchParams.get('token')?.trim() ?? '';
  const { localId, profileReady } = useAuth();
  const supabase = getSupabaseClient();

  const [phase, setPhase] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchById>>>(null);

  useEffect(() => {
    if (!supabase) return;
    if (!token) {
      setPhase('err');
      setErrMsg(MSG_NO_TOKEN);
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
      setPhase('err');
      setErrMsg(MSG_DENIED);
      return;
    }
    let cancelled = false;
    setPhase('loading');
    setErrMsg(null);
    void (async () => {
      try {
        const b = await ccFetchBatchById(supabase, batchId);
        if (cancelled) return;
        if (!b) {
          setBatch(null);
          setPhase('err');
          setErrMsg(MSG_DENIED);
          return;
        }
        if (!batchQrTokensMatch(b.qr_token, token)) {
          setBatch(null);
          setPhase('err');
          setErrMsg(MSG_BAD_TOKEN);
          return;
        }
        setBatch(b);
        setPhase('ok');
      } catch (e) {
        if (cancelled) return;
        setBatch(null);
        setPhase('err');
        setErrMsg(e instanceof Error ? e.message : 'Error al cargar el lote.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, batchId, token]);

  if (!profileReady) {
    return <p className="text-sm text-zinc-500">Cargando…</p>;
  }
  if (!isSupabaseEnabled() || !supabase) {
    return <p className="text-sm text-zinc-600">Conexión no disponible. No se puede verificar el lote.</p>;
  }

  if (phase === 'loading' || phase === 'idle') {
    return <p className="text-sm text-zinc-500">Cargando lote…</p>;
  }
  if (phase === 'err' || !batch) {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
        <p className="font-semibold text-zinc-900">{errMsg ?? MSG_DENIED}</p>
        <p className="text-xs text-zinc-600">
          El enlace del QR debe incluir el lote y el parámetro <code className="rounded bg-zinc-200 px-1">token</code>{' '}
          (etiqueta impresa o pantalla de etiqueta).
        </p>
      </div>
    );
  }

  return <LoteQrFichaContent supabase={supabase} batch={batch} localId={localId} />;
}

export default function CocinaCentralLoteByIdPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <LoteByIdBody />
    </Suspense>
  );
}
