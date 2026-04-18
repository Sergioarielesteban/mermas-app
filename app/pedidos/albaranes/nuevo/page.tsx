'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, ScanLine, Upload } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import PedidosPremiaLockedScreen from '@/components/PedidosPremiaLockedScreen';
import { canAccessPedidos, canUsePedidosModule } from '@/lib/pedidos-access';
import { compressImageFileToJpeg, runAlbaranOcrViaTextract } from '@/lib/pedidos-albaran-ocr';
import {
  parseDeliveryNoteHeaderFromOcr,
  parseDeliveryNoteLinesFromOcr,
  parseYmdFromGuess,
} from '@/lib/delivery-notes-ocr-heuristic';
import {
  insertDeliveryNote,
  insertDeliveryNoteOcrRun,
  replaceDeliveryNoteItems,
  updateDeliveryNote,
  type DeliveryNoteItemDraft,
} from '@/lib/delivery-notes-supabase';
import { uploadDeliveryNoteOriginal } from '@/lib/delivery-notes-storage';
import { fetchSuppliersWithProducts, type PedidoSupplier } from '@/lib/pedidos-supabase';
import type { Unit } from '@/lib/types';

export default function NuevoAlbaranPage() {
  const router = useRouter();
  const { localCode, localName, localId, email, userId, profileReady } = useAuth();
  const hasPedidosEntry = canAccessPedidos(localCode, email, localName, localId);
  const canUse = canUsePedidosModule(localCode, email, localName, localId);
  const supabaseOk = isSupabaseEnabled() && getSupabaseClient();

  const [suppliers, setSuppliers] = useState<PedidoSupplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localId || !supabaseOk || !profileReady) return;
    void fetchSuppliersWithProducts(getSupabaseClient()!, localId)
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [localId, supabaseOk, profileReady]);

  const runImport = async () => {
    if (!localId || !supabaseOk) return;
    const supabase = getSupabaseClient()!;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Selecciona un PDF o imagen del albarán.');
      return;
    }

    setBusy(true);
    setError(null);
    setPhase('Creando registro…');

    try {
      const sup = suppliers.find((s) => s.id === supplierId);
      const note = await insertDeliveryNote(supabase, localId, {
        supplierId: sup?.id ?? null,
        supplierName: sup?.name ?? '',
        status: 'draft',
        sourceType: 'manual',
        createdBy: userId ?? null,
      });

      setPhase('Subiendo documento…');
      const up = await uploadDeliveryNoteOriginal(supabase, localId, note.id, file);

      const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
      let ocrText = '';
      let ocrStatus: 'ok' | 'partial' | 'failed' | 'skipped' = 'skipped';
      const t0 = Date.now();

      if (!isPdf && file.type.startsWith('image/')) {
        setPhase('Comprimiendo…');
        const blob = await compressImageFileToJpeg(file);
        setPhase('OCR (Textract)…');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) {
          throw new Error('Sesión no válida.');
        }
        try {
          ocrText = await runAlbaranOcrViaTextract(blob, sessionData.session.access_token);
          ocrStatus = ocrText.trim().length > 40 ? 'ok' : 'partial';
        } catch (e) {
          ocrText = e instanceof Error ? e.message : 'OCR fallido';
          ocrStatus = 'failed';
        }
        const ms = Date.now() - t0;
        await insertDeliveryNoteOcrRun(supabase, localId, note.id, ocrText || '', {
          errorMessage: ocrStatus === 'failed' ? ocrText : null,
          durationMs: ms,
          createdBy: userId ?? null,
        });
      } else {
        await insertDeliveryNoteOcrRun(supabase, localId, note.id, 'PDF almacenado. OCR síncrono no aplicado.', {
          errorMessage: null,
          durationMs: null,
          createdBy: userId ?? null,
        });
      }

      const header = isPdf ? parseDeliveryNoteHeaderFromOcr('') : parseDeliveryNoteHeaderFromOcr(ocrText);
      const linesParsed = isPdf ? [] : parseDeliveryNoteLinesFromOcr(ocrText);
      const ymd = parseYmdFromGuess(header.dateGuess);

      const drafts: DeliveryNoteItemDraft[] = linesParsed.map((l) => ({
        supplierProductName: l.supplierProductName,
        quantity: l.quantity,
        unit: l.unit as Unit,
        unitPrice: l.unitPrice,
        lineSubtotal: l.lineSubtotal,
        matchStatus: 'not_applicable',
      }));

      if (drafts.length > 0) {
        await replaceDeliveryNoteItems(supabase, localId, note.id, drafts);
      }

      const supplierNameFinal =
        (sup?.name ?? '').trim() ||
        header.supplierGuess.trim() ||
        'Proveedor';

      await updateDeliveryNote(supabase, localId, note.id, {
        supplierName: supplierNameFinal,
        deliveryNoteNumber: header.numberGuess || note.deliveryNoteNumber,
        deliveryDate: ymd,
        subtotal: null,
        taxAmount: header.taxGuess,
        totalAmount: header.totalGuess,
        ocrStatus,
        sourceType: isPdf ? 'manual' : ocrText ? 'ocr' : 'manual',
        originalStoragePath: up.storagePath,
        originalMimeType: up.mimeType,
        originalFileName: up.fileName,
        notes: isPdf ? 'PDF almacenado. OCR automático no aplica (sube foto o rellena líneas a mano en el detalle).' : '',
        status: isPdf ? 'pending_review' : ocrStatus === 'ok' || ocrStatus === 'partial' ? 'ocr_read' : 'pending_review',
      });

      router.push(`/pedidos/albaranes/${note.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al importar.';
      if (msg.includes('does not exist')) {
        setError('Ejecuta en Supabase: supabase-pedidos-delivery-notes.sql');
      } else {
        setError(msg);
      }
      setPhase(null);
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">Cargando…</p>
      </section>
    );
  }

  if (!hasPedidosEntry) return <PedidosPremiaLockedScreen />;
  if (!canUse || !localId || !supabaseOk) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">No disponible.</p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-10">
      <MermasStyleHero
        slim
        eyebrow="Albaranes"
        title="Importar albarán"
        description="Sube imagen (OCR con Textract) o PDF (solo archivo; revisión manual). Independiente del OCR dentro de cada pedido enviado."
      />
      <Link
        href="/pedidos/albaranes"
        className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Bandeja
      </Link>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5">
        <label className="text-[10px] font-bold uppercase text-zinc-500">Proveedor</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
        >
          <option value="">— Opcional (mejora el nombre si el OCR falla) —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-[10px] font-bold uppercase text-zinc-500">Documento</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="mt-1 w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Imagen: se intenta OCR. PDF: se guarda y se marca para revisión manual (límites del bucket ampliados en la
          migración).
        </p>

        {error ? <p className="mt-3 text-sm font-semibold text-red-800">{error}</p> : null}
        {phase ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#D32F2F]" aria-hidden />
            {phase}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void runImport()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] py-3.5 text-sm font-black text-white shadow-lg disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          Subir y procesar
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500">
          <ScanLine className="h-3.5 w-3.5" aria-hidden />
          Misma API Textract que el lector de pedidos; este flujo crea un albarán archivado en bandeja.
        </p>
      </section>
    </div>
  );
}
