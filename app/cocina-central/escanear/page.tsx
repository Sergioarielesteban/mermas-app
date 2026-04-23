'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isSupabaseEnabled, getSupabaseClient } from '@/lib/supabase-client';

function extractToken(raw: string): string | null {
  const t = raw.trim();
  try {
    const u = new URL(t);
    const q = u.searchParams.get('token');
    if (q) return q;
  } catch {
    /* texto plano */
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return t;
  }
  return null;
}

export default function CocinaCentralEscanearPage() {
  const router = useRouter();
  const { profileReady, localId, isCentralKitchen } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isCentralKitchen) return;
    if (!isSupabaseEnabled() || !getSupabaseClient() || !localId) return;
    if (started.current) return;
    started.current = true;
    let html5: import('html5-qrcode').Html5Qrcode | null = null;
    const run = async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5 = new Html5Qrcode('cc-scan-region');
      await html5.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const token = extractToken(decoded);
          if (token) {
            void html5?.stop().catch(() => {});
            router.push(`/cocina-central/lote?token=${encodeURIComponent(token)}`);
          }
        },
        () => {},
      );
    };
    run().catch((e) => setErr(e instanceof Error ? e.message : 'No se pudo usar la cámara'));
    return () => {
      void html5?.stop().catch(() => {});
    };
  }, [router, localId, isCentralKitchen]);

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!isSupabaseEnabled() || !getSupabaseClient() || !localId) {
    return <p className="text-sm text-zinc-600">Necesitas sesión Supabase.</p>;
  }

  if (!isCentralKitchen) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-zinc-900">Escanear QR</h1>
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          El escáner de códigos de lote solo está disponible en usuarios de{' '}
          <strong>cocina central</strong>. En sedes satélite usa recepciones y la ficha del lote cuando te la
          compartan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-zinc-900">Escanear QR</h1>
      <p className="text-sm text-zinc-600">Apunta al código de la etiqueta de lote.</p>
      <div
        id="cc-scan-region"
        className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-black"
      />
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
    </div>
  );
}
