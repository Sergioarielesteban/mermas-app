'use client';

/**
 * Flujo OCR unificado de albaranes.
 *
 * Único punto de entrada para crear un `delivery_note` a partir de cámara / archivo:
 * - Reutiliza `runAlbaranOcr` (engine compartido cliente ↔ servidor).
 * - Reutiliza la heurística `parseDeliveryNoteHeaderFromOcr` / `parseDeliveryNoteLinesFromOcr`.
 * - Crea la fila en `delivery_notes`, sube el original, registra el OCR run y persiste líneas.
 * - Si `relatedOrderId` viene seteado (entrada desde la recepción de un pedido), se vincula
 *   automáticamente desde el momento de creación.
 *
 * Modos:
 *   - `mode="sheet"`  — bottom-sheet (default).
 *   - `mode="inline"` — card embebido (lo usa la página `/pedidos/albaranes/nuevo`).
 *
 * Al terminar redirige a `/pedidos/albaranes/[id]` para que el usuario revise/valide.
 * Si `onCreated` está definido, se ejecuta antes de la redirección.
 */

import { useRouter } from 'next/navigation';
import React from 'react';
import { Camera, FileUp, Loader2, ScanLine, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { compressImageFileToJpeg, runAlbaranOcr } from '@/lib/pedidos-albaran-ocr';
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
import type { Unit } from '@/lib/types';

type LauncherMode = 'sheet' | 'inline';

type Props = {
  mode?: LauncherMode;
  open?: boolean;
  onClose?: () => void;
  /**
   * Si viene seteado, el albarán se crea vinculado a este pedido (flujo desde recepción).
   * Se respeta la separación: el `delivery_note` queda como documento autónomo,
   * pero con `relatedOrderId` para que el cruce ya esté resuelto.
   */
  relatedOrderId?: string | null;
  /** Llamado cuando el albarán se ha creado con éxito (recibe el id). */
  onCreated?: (deliveryNoteId: string) => void;
  /** Si true, no se redirige tras crear. Útil para flujos custom. */
  skipRedirect?: boolean;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'compress' }
  | { kind: 'create' }
  | { kind: 'upload' }
  | { kind: 'ocr' }
  | { kind: 'parse' }
  | { kind: 'persist' }
  | { kind: 'done' };

function phaseLabel(p: Phase): string | null {
  switch (p.kind) {
    case 'compress':
      return 'Optimizando imagen…';
    case 'create':
      return 'Creando albarán…';
    case 'upload':
      return 'Subiendo documento…';
    case 'ocr':
      return 'Leyendo con OCR…';
    case 'parse':
      return 'Interpretando líneas…';
    case 'persist':
      return 'Guardando…';
    case 'done':
      return 'Listo';
    default:
      return null;
  }
}

export default function AlbaranOcrLauncher({
  mode = 'sheet',
  open = true,
  onClose,
  relatedOrderId = null,
  onCreated,
  skipRedirect,
}: Props) {
  const router = useRouter();
  const { localId, userId } = useAuth();
  const supabaseOk = isSupabaseEnabled() && !!getSupabaseClient();

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [phase, setPhase] = React.useState<Phase>({ kind: 'idle' });
  const [error, setError] = React.useState<string | null>(null);

  const busy = phase.kind !== 'idle' && phase.kind !== 'done';

  const reset = React.useCallback(() => {
    setPhase({ kind: 'idle' });
    setError(null);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  React.useEffect(() => {
    if (mode === 'sheet' && open) {
      reset();
    }
  }, [mode, open, reset]);

  const handleFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!localId || !supabaseOk) {
        setError('Sesión no disponible.');
        return;
      }
      const supabase = getSupabaseClient()!;
      setError(null);

      try {
        setPhase({ kind: 'create' });
        const note = await insertDeliveryNote(supabase, localId, {
          supplierId: null,
          supplierName: '',
          relatedOrderId: relatedOrderId ?? undefined,
          status: 'draft',
          sourceType: 'manual',
          createdBy: userId ?? null,
        });

        setPhase({ kind: 'upload' });
        const uploaded = await uploadDeliveryNoteOriginal(supabase, localId, note.id, file);

        const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        let ocrText = '';
        let ocrStatus: 'ok' | 'partial' | 'failed' | 'skipped' = 'skipped';
        const t0 = Date.now();

        if (!isPdf && file.type.startsWith('image/')) {
          setPhase({ kind: 'compress' });
          const blob = await compressImageFileToJpeg(file);

          setPhase({ kind: 'ocr' });
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !sessionData.session?.access_token) {
            throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
          }
          try {
            ocrText = await runAlbaranOcr(blob, sessionData.session.access_token);
            ocrStatus = ocrText.trim().length > 40 ? 'ok' : 'partial';
          } catch (e) {
            ocrText = e instanceof Error ? e.message : 'OCR fallido';
            ocrStatus = 'failed';
          }
          await insertDeliveryNoteOcrRun(supabase, localId, note.id, ocrText || '', {
            errorMessage: ocrStatus === 'failed' ? ocrText : null,
            durationMs: Date.now() - t0,
            createdBy: userId ?? null,
          });
        } else {
          await insertDeliveryNoteOcrRun(
            supabase,
            localId,
            note.id,
            'PDF almacenado. OCR síncrono no aplicado.',
            {
              errorMessage: null,
              durationMs: null,
              createdBy: userId ?? null,
            },
          );
        }

        setPhase({ kind: 'parse' });
        const header = isPdf
          ? parseDeliveryNoteHeaderFromOcr('')
          : parseDeliveryNoteHeaderFromOcr(ocrText);
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

        setPhase({ kind: 'persist' });
        await updateDeliveryNote(supabase, localId, note.id, {
          supplierName: header.supplierGuess.trim() || 'Proveedor',
          deliveryNoteNumber: header.numberGuess || note.deliveryNoteNumber,
          deliveryDate: ymd,
          subtotal: null,
          taxAmount: header.taxGuess,
          totalAmount: header.totalGuess,
          ocrStatus,
          sourceType: isPdf ? 'manual' : ocrText ? 'ocr' : 'manual',
          originalStoragePath: uploaded.storagePath,
          originalMimeType: uploaded.mimeType,
          originalFileName: uploaded.fileName,
          notes: isPdf
            ? 'PDF almacenado. Revisa proveedor, fecha y líneas a mano en el detalle.'
            : '',
          status: isPdf
            ? 'pending_review'
            : ocrStatus === 'ok' || ocrStatus === 'partial'
              ? 'ocr_read'
              : 'pending_review',
        });

        setPhase({ kind: 'done' });
        onCreated?.(note.id);

        if (mode === 'sheet') onClose?.();
        if (!skipRedirect) {
          router.push(`/pedidos/albaranes/${note.id}`);
        } else {
          // Permite reabrir el launcher para un segundo albarán.
          setTimeout(reset, 500);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'No se pudo procesar el albarán.';
        if (msg.includes('does not exist')) {
          setError('Ejecuta en Supabase: supabase-pedidos-delivery-notes.sql');
        } else {
          setError(msg);
        }
        setPhase({ kind: 'idle' });
      }
    },
    [localId, mode, onClose, onCreated, relatedOrderId, router, skipRedirect, supabaseOk, userId, reset],
  );

  const onCameraChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
    },
    [handleFile],
  );

  const onFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFile(e.target.files?.[0]);
    },
    [handleFile],
  );

  const content = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/20">
          <ScanLine className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black text-zinc-900">Escanear albarán</h2>
          <p className="text-[13px] text-zinc-600">Recepción rápida con OCR</p>
          <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
            <li>· Extrae líneas y precios automáticamente</li>
            <li>· Detecta diferencias contra el pedido</li>
            <li>· Vincula con el pedido cuando coincide</li>
          </ul>
        </div>
        {mode === 'sheet' && onClose ? (
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="group flex h-24 flex-col items-center justify-center gap-1.5 rounded-2xl bg-[#D32F2F] px-4 text-white shadow-lg ring-1 ring-[#D32F2F]/30 transition active:scale-[0.98] disabled:opacity-60"
        >
          <Camera className="h-6 w-6" aria-hidden />
          <span className="text-[13px] font-black tracking-tight">Cámara</span>
          <span className="text-[10px] font-semibold text-white/80">Fotografía el albarán</span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="group flex h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-4 text-zinc-900 shadow-sm transition active:scale-[0.98] disabled:opacity-60"
        >
          <FileUp className="h-6 w-6 text-[#D32F2F]" aria-hidden />
          <span className="text-[13px] font-black tracking-tight">Subir PDF / Imagen</span>
          <span className="text-[10px] font-semibold text-zinc-500">Desde galería o archivos</span>
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onFileChange}
      />

      {phase.kind !== 'idle' && phase.kind !== 'done' ? (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-[#D32F2F]" aria-hidden />
          <p className="text-[13px] font-semibold text-zinc-700">{phaseLabel(phase)}</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <p className="text-center text-[10.5px] text-zinc-400">
        Mismo flujo OCR para todo Chef One · Se guarda y queda pendiente de revisión
      </p>
    </div>
  );

  if (mode === 'inline') {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        {content}
      </section>
    );
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
        {content}
      </div>
    </div>
  );
}
