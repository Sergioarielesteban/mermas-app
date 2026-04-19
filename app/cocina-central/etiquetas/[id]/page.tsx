'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { ccFetchBatchById, ccProductName } from '@/lib/cocina-central-supabase';

export default function CocinaCentralEtiquetaPage() {
  const { id } = useParams<{ id: string }>();
  const { profileReady, localId } = useAuth();
  const supabase = getSupabaseClient();
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof ccFetchBatchById>>>(null);

  useEffect(() => {
    if (!supabase || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const b = await ccFetchBatchById(supabase, id);
        if (cancelled) return;
        setBatch(b);
        if (!b) {
          setErr('Lote no encontrado');
          return;
        }
        const origin =
          typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL ?? '';
        const url = `${origin}/cocina-central/lote?token=${encodeURIComponent(b.qr_token)}`;
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 200 });
        if (!cancelled) setQr(dataUrl);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Error QR');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !supabase || !localId) return <p className="text-sm text-zinc-600">Sin sesión.</p>;

  if (!batch) {
    return <p className="text-sm text-zinc-600">{err ?? 'Cargando lote…'}</p>;
  }

  return (
    <div className="space-y-6 print:max-w-[320px]">
      <Link href={`/cocina-central/lotes/${batch.id}`} className="text-sm font-bold text-[#D32F2F] print:hidden">
        ← Ficha lote
      </Link>

      <div className="mx-auto max-w-sm rounded-2xl border-2 border-zinc-900 bg-white p-6 text-center print:border-black">
        <p className="text-lg font-extrabold leading-tight text-zinc-900">
          {ccProductName((Array.isArray(batch.central_preparations) ? batch.central_preparations[0] : batch.central_preparations) ?? batch.products)}
        </p>
        <p className="mt-3 text-sm font-bold text-zinc-700">Lote {batch.codigo_lote}</p>
        <p className="mt-2 text-xs text-zinc-600">
          Elaboración {batch.fecha_elaboracion}
          {batch.fecha_caducidad ? ` · Cad. ${batch.fecha_caducidad}` : ''}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Estado: {batch.estado}</p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Código QR del lote" className="mx-auto mt-4 h-48 w-48" />
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Generando QR…</p>
        )}
        <p className="mt-2 break-all font-mono text-[10px] text-zinc-400">{batch.qr_token}</p>
      </div>

      {err ? <p className="text-center text-sm text-red-600">{err}</p> : null}

      <button
        type="button"
        onClick={() => window.print()}
        className="h-12 w-full rounded-2xl bg-zinc-900 text-sm font-extrabold text-white print:hidden"
      >
        Imprimir etiqueta
      </button>
    </div>
  );
}
