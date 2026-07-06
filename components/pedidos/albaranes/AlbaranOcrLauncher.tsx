'use client';

/**
 * Flujo OCR unificado de albaranes.
 *
 * Único punto de entrada para crear un `delivery_note` a partir de cámara / archivo:
 * - OCR: Document AI + Gemini vía POST /api/ocr/process (único motor).
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
import { Camera, FileText, FileUp, Loader2, PlusCircle, ScanLine, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient, isSupabaseEnabled } from '@/lib/supabase-client';
import { compressImageFileToJpeg } from '@/lib/pedidos-albaran-ocr';
import {
  insertDeliveryNote,
  insertDeliveryNoteOcrRun,
  replaceDeliveryNoteItems,
  updateDeliveryNote,
  type DeliveryNoteItemDraft,
} from '@/lib/delivery-notes-supabase';
import { uploadDeliveryNoteOriginal } from '@/lib/delivery-notes-storage';
import { runAlbaranOcrProcess } from '@/lib/ocr/client-process';
import type { AlbaranOcrPayload, AlbaranOcrUnit } from '@/lib/ocr/types-document';
import type { Unit } from '@/lib/types';

// Mapeo OCR-unit → Unit del catálogo. Se usa solo para volcar líneas al draft
// (la unidad final la corregirá el usuario en el detalle si hace falta).
const OCR_UNIT_TO_UNIT: Record<AlbaranOcrUnit, Unit> = {
  kg: 'kg',
  ud: 'ud',
  caja: 'caja',
  bolsa: 'bolsa',
  paquete: 'paquete',
  bandeja: 'bandeja',
  racion: 'racion',
  g: 'kg',
  l: 'ud',
  ml: 'ud',
};

const OCR_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'image/heic',
  'image/heif',
]);

const OCR_ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|pdf|heic|heif)$/i;
const OCR_MAX_BYTES = 10 * 1024 * 1024;

function validateOcrFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const extOk = OCR_ALLOWED_EXTENSIONS.test(file.name);
  const mimeOk = OCR_ALLOWED_MIME_TYPES.has(mime);
  if (!extOk && mime !== 'application/pdf') {
    return 'Formato no compatible. Sube JPG, PNG, HEIC o PDF.';
  }
  if (!mimeOk) {
    return 'Formato no compatible. Sube JPG, PNG, HEIC o PDF.';
  }
  if (file.size <= 0) {
    return 'El archivo está vacío.';
  }
  if (file.size > OCR_MAX_BYTES) {
    return `El archivo supera ${(OCR_MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`;
  }
  return null;
}

function operationalOcrErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (process.env.NODE_ENV === 'development') {
    console.error('[Pedidos OCR] process failed:', error);
  }
  if (raw.toLowerCase().includes('sesión')) return 'Sesión no válida. Vuelve a iniciar sesión.';
  return 'No se pudo procesar el albarán. Revisa el documento manualmente.';
}

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
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const busy = phase.kind !== 'idle' && phase.kind !== 'done';

  const reset = React.useCallback(() => {
    setPhase({ kind: 'idle' });
    setError(null);
    setPickerOpen(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  React.useEffect(() => {
    if (mode === 'sheet' && open) {
      queueMicrotask(reset);
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

      const validationError = validateOcrFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      let createdNoteId: string | null = null;
      let uploadedOriginal: Awaited<ReturnType<typeof uploadDeliveryNoteOriginal>> | null = null;
      let ocrStartedAt: number | null = null;

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
        createdNoteId = note.id;

        setPhase({ kind: 'upload' });
        const uploaded = await uploadDeliveryNoteOriginal(supabase, localId, note.id, file);
        uploadedOriginal = uploaded;

        const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) {
          throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
        }
        const accessToken = sessionData.session.access_token;
        const t0 = Date.now();
        ocrStartedAt = t0;

        setPhase({ kind: 'ocr' });
        let bodyBlob: Blob;
        let bodyName = file.name;
        if (!isPdf && file.type.startsWith('image/')) {
          setPhase({ kind: 'compress' });
          bodyBlob = await compressImageFileToJpeg(file);
          bodyName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          setPhase({ kind: 'ocr' });
        } else {
          bodyBlob = file;
        }

        const res = await runAlbaranOcrProcess({
          blobOrFile: bodyBlob,
          accessToken,
          relatedOrderId: relatedOrderId ?? undefined,
          fileName: bodyName,
        });

        if (!res.ok) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[Pedidos OCR] provider failed:', res);
          }
          throw new Error('ocr_failed');
        }

        const payload: AlbaranOcrPayload = res.payload;
        const ocrText = payload.ocrText || '';
        const ocrStatus: 'ok' | 'partial' =
          ocrText.trim().length > 40 && payload.lines.length > 0 ? 'ok' : 'partial';

        await insertDeliveryNoteOcrRun(supabase, localId, note.id, ocrText, {
          errorMessage: null,
          durationMs: Date.now() - t0,
          createdBy: userId ?? null,
        });

        setPhase({ kind: 'parse' });

        const drafts: DeliveryNoteItemDraft[] = payload.lines
          .filter((l) => (l.description || '').trim().length > 0)
          .map<DeliveryNoteItemDraft>((l) => ({
            supplierProductName: l.description,
            quantity: l.quantity ?? 0,
            unit: l.unit ? OCR_UNIT_TO_UNIT[l.unit] : 'ud',
            unitPrice: l.unitPrice ?? 0,
            lineSubtotal: l.lineTotal ?? null,
            matchStatus: 'not_applicable',
          }));
        const supplierName = payload.supplier.name?.trim() || 'Proveedor';
        const deliveryNumber = payload.document.number;
        const ymd = payload.document.date;
        const taxAmount = payload.totals.taxAmount;
        const totalAmount = payload.totals.total;
        const warnings = [
          ...payload.warnings,
          ...payload.lines.flatMap((l, i) => l.warnings.map((w) => `Línea ${i + 1}: ${w}`)),
        ];
        const notesSummary = [payload.observations.trim(), warnings.length ? `Avisos OCR: ${warnings.slice(0, 6).join(' · ')}` : '']
          .filter(Boolean)
          .join('\n');

        if (drafts.length > 0) {
          await replaceDeliveryNoteItems(supabase, localId, note.id, drafts);
        }

        setPhase({ kind: 'persist' });
        await updateDeliveryNote(supabase, localId, note.id, {
          supplierName,
          deliveryNoteNumber: deliveryNumber || note.deliveryNoteNumber,
          deliveryDate: ymd,
          subtotal: null,
          taxAmount,
          totalAmount,
          ocrStatus,
          sourceType: 'ocr',
          originalStoragePath: uploaded.storagePath,
          originalMimeType: uploaded.mimeType,
          originalFileName: uploaded.fileName,
          notes: notesSummary,
          status: ocrStatus === 'ok' || ocrStatus === 'partial' ? 'ocr_read' : 'pending_review',
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
        if (createdNoteId) {
          const msg = operationalOcrErrorMessage(e);
          try {
            await updateDeliveryNote(supabase, localId, createdNoteId, {
              ...(uploadedOriginal
                ? {
                    originalStoragePath: uploadedOriginal.storagePath,
                    originalMimeType: uploadedOriginal.mimeType,
                    originalFileName: uploadedOriginal.fileName,
                  }
                : {}),
              ocrStatus: 'failed',
              sourceType: 'ocr',
              status: 'pending_review',
              notes: msg,
            });
            await insertDeliveryNoteOcrRun(supabase, localId, createdNoteId, '', {
              errorMessage: e instanceof Error ? e.message : 'ocr_failed',
              durationMs: ocrStartedAt != null ? Date.now() - ocrStartedAt : null,
              createdBy: userId ?? null,
            }).catch((err) => {
              if (process.env.NODE_ENV === 'development') console.error('[Pedidos OCR] failed to store OCR run:', err);
            });
            setPhase({ kind: 'done' });
            onCreated?.(createdNoteId);
            if (mode === 'sheet') onClose?.();
            if (!skipRedirect) {
              router.push(`/pedidos/albaranes/${createdNoteId}`);
            } else {
              setError(msg);
            }
            return;
          } catch (recoverErr) {
            if (process.env.NODE_ENV === 'development') console.error('[Pedidos OCR] recovery failed:', recoverErr);
          }
        }
        setError(operationalOcrErrorMessage(e));
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

  const openCamera = () => {
    setPickerOpen(false);
    cameraRef.current?.click();
  };
  const openGallery = () => {
    setPickerOpen(false);
    fileRef.current?.click();
  };
  const openPdf = () => {
    setPickerOpen(false);
    fileRef.current?.click();
  };

  const content = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#D32F2F]/10 text-[#D32F2F] ring-1 ring-[#D32F2F]/15">
          <ScanLine className="h-5.5 w-5.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-black text-zinc-900">Añadir albarán</h2>
          <p className="text-[12.5px] text-zinc-600">OCR inteligente activado</p>
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

      {!pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#D32F2F] px-4 text-white shadow-lg ring-1 ring-[#D32F2F]/20 active:scale-[0.99] disabled:opacity-60"
        >
          <PlusCircle className="h-5 w-5" aria-hidden />
          <span className="text-[14px] font-black tracking-tight">Añadir albarán</span>
        </button>
      ) : (
        <div className="space-y-2.5 rounded-3xl border border-zinc-200 bg-zinc-50 p-3">
          <button
            type="button"
            onClick={openCamera}
            disabled={busy}
            className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left shadow-sm ring-1 ring-zinc-200 disabled:opacity-60"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D32F2F]/10 text-[#D32F2F]">
              <Camera className="h-4.5 w-4.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-zinc-900">Fotografiar albarán</p>
              <p className="text-[11px] text-zinc-500">Usar la cámara</p>
            </div>
          </button>
          <button
            type="button"
            onClick={openGallery}
            disabled={busy}
            className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left shadow-sm ring-1 ring-zinc-200 disabled:opacity-60"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D32F2F]/10 text-[#D32F2F]">
              <FileUp className="h-4.5 w-4.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-zinc-900">Elegir imagen</p>
              <p className="text-[11px] text-zinc-500">Galería o archivos</p>
            </div>
          </button>
          <button
            type="button"
            onClick={openPdf}
            disabled={busy}
            className="flex h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left shadow-sm ring-1 ring-zinc-200 disabled:opacity-60"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D32F2F]/10 text-[#D32F2F]">
              <FileText className="h-4.5 w-4.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-zinc-900">Subir PDF</p>
              <p className="text-[11px] text-zinc-500">Archivo del albarán</p>
            </div>
          </button>
        </div>
      )}

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
        Se guarda como albarán pendiente de revisión
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
