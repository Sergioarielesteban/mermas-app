'use client';

import React from 'react';
import { ScanLine, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { compressImageFileToJpeg, runAlbaranOcrViaTextract } from '@/lib/pedidos-albaran-ocr';
import { uploadPedidoAlbaranAttachment } from '@/lib/pedidos-albaran-storage';
import { buildAlbaranSuggestionsFromOcr, type AlbaranOcrLineSuggestion } from '@/lib/pedidos-albaran-suggest';
import { applyAlbaranOcrPatches, type AlbaranOcrApplyPatch, type PedidoOrder } from '@/lib/pedidos-supabase';

type Props = {
  order: PedidoOrder | null;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
};

export default function PedidosAlbaranOcrModal({ order, open, onClose, onApplied }: Props) {
  const { localId } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [savePhoto, setSavePhoto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ocrText, setOcrText] = React.useState('');
  const [jpegBlob, setJpegBlob] = React.useState<Blob | null>(null);
  const [suggestions, setSuggestions] = React.useState<AlbaranOcrLineSuggestion[]>([]);
  const [applyIds, setApplyIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!open) {
      setSavePhoto(false);
      setBusy(false);
      setPhase(null);
      setError(null);
      setOcrText('');
      setJpegBlob(null);
      setSuggestions([]);
      setApplyIds({});
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  if (!open || !order) return null;

  const runScan = async () => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file || !localId) {
      setError('Selecciona una foto del albarán.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase no disponible.');
      return;
    }

    setBusy(true);
    setError(null);
    setPhase('Comprimiendo imagen…');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        setError('Sesión no válida. Vuelve a iniciar sesión.');
        setPhase(null);
        setBusy(false);
        return;
      }
      const blob = await compressImageFileToJpeg(file);
      setJpegBlob(blob);
      setPhase('Leyendo albarán con Textract…');
      const text = await runAlbaranOcrViaTextract(blob, sessionData.session.access_token);
      setOcrText(text);
      const sug = buildAlbaranSuggestionsFromOcr(text, order.items);
      setSuggestions(sug);
      const init: Record<string, boolean> = {};
      for (const s of sug) init[s.itemId] = true;
      setApplyIds(init);
      setPhase(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer el albarán.');
      setPhase(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleApply = (itemId: string) => {
    setApplyIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const applySelected = async () => {
    if (!localId || !order) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase no disponible.');
      return;
    }

    const patches: AlbaranOcrApplyPatch[] = [];
    for (const s of suggestions) {
      if (!applyIds[s.itemId]) continue;
      const p: AlbaranOcrApplyPatch = { itemId: s.itemId };
      if (s.receivedQuantity != null) p.receivedQuantity = s.receivedQuantity;
      if (s.pricePerUnit != null) p.pricePerUnit = s.pricePerUnit;
      if (s.receivedWeightKg != null) p.receivedWeightKg = s.receivedWeightKg;
      if (s.receivedPricePerKg != null) p.receivedPricePerKg = s.receivedPricePerKg;
      if (
        p.receivedQuantity != null ||
        p.pricePerUnit != null ||
        p.receivedWeightKg != null ||
        p.receivedPricePerKg != null
      ) {
        patches.push(p);
      }
    }

    if (patches.length === 0 && !(savePhoto && jpegBlob)) {
      setError('Marca líneas para aplicar, o activa «Guardar foto» si solo quieres archivar la imagen.');
      return;
    }

    setBusy(true);
    setError(null);
    setPhase('Guardando líneas…');
    try {
      if (savePhoto && jpegBlob) {
        setPhase('Subiendo foto…');
        await uploadPedidoAlbaranAttachment(supabase, localId, order.id, jpegBlob);
      }
      if (patches.length > 0) {
        setPhase('Guardando líneas…');
        await applyAlbaranOcrPatches(supabase, localId, order.items, patches);
      }
      setPhase(null);
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setPhase(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end sm:justify-center sm:p-4" role="dialog" aria-modal>
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-[91] mx-auto flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-[#D32F2F]" strokeWidth={2.2} />
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-900">Escanear albarán</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose()}
            className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-xs leading-relaxed text-zinc-600">
            {order.supplierName} · revisa siempre las cantidades y precios antes de aplicar. El OCR puede equivocarse.
          </p>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5">
            <input
              type="checkbox"
              checked={savePhoto}
              disabled={busy}
              onChange={(e) => setSavePhoto(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-xs font-semibold text-zinc-800">
              Guardar foto en Supabase (opcional, comprimida). Requiere migración{' '}
              <code className="rounded bg-white px-1 text-[10px]">supabase-pedidos-albaran-storage.sql</code>.
            </span>
          </label>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              disabled={busy}
              className="block w-full text-xs font-medium text-zinc-700 file:mr-2 file:rounded-lg file:border-0 file:bg-[#D32F2F] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
            />
            <p className="mt-1.5 text-center text-[10px] font-medium text-zinc-500">
              Puedes elegir una imagen de la galería, del explorador de archivos o hacer la foto al momento.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void runScan()}
            className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
          >
            {busy && !suggestions.length ? phase ?? 'Procesando…' : 'Leer albarán'}
          </button>

          {phase && suggestions.length > 0 ? (
            <p className="text-center text-xs font-semibold text-zinc-500">{phase}</p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
              {error}
            </p>
          ) : null}

          {suggestions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-zinc-500">Sugerencias por línea</p>
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.itemId} className="rounded-xl border border-zinc-200 bg-white p-3 ring-1 ring-zinc-50">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-zinc-300"
                        checked={Boolean(applyIds[s.itemId])}
                        disabled={busy}
                        onChange={() => toggleApply(s.itemId)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-zinc-900">{s.productName}</p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase text-zinc-400">
                          Confianza: {s.confidence}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-700">
                          {s.receivedQuantity != null ? (
                            <>
                              <dt className="font-semibold text-zinc-500">Cant.</dt>
                              <dd className="font-bold text-zinc-900">{s.receivedQuantity}</dd>
                            </>
                          ) : null}
                          {s.receivedWeightKg != null ? (
                            <>
                              <dt className="font-semibold text-zinc-500">Kg</dt>
                              <dd className="font-bold text-zinc-900">{s.receivedWeightKg}</dd>
                            </>
                          ) : null}
                          {s.receivedPricePerKg != null ? (
                            <>
                              <dt className="font-semibold text-zinc-500">€/kg</dt>
                              <dd className="font-bold text-zinc-900">{s.receivedPricePerKg}</dd>
                            </>
                          ) : null}
                          {s.pricePerUnit != null ? (
                            <>
                              <dt className="font-semibold text-zinc-500">Precio u.</dt>
                              <dd className="font-bold text-zinc-900">{s.pricePerUnit.toFixed(2)} €</dd>
                            </>
                          ) : null}
                        </dl>
                        <p className="mt-2 line-clamp-2 text-[10px] text-zinc-400" title={s.matchedSnippet}>
                          OCR: {s.matchedSnippet}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busy}
                onClick={() => void applySelected()}
                className="w-full rounded-xl bg-[#D32F2F] py-3 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
              >
                {busy ? phase ?? 'Guardando…' : 'Guardar / aplicar'}
              </button>
            </div>
          ) : ocrText && !busy ? (
            <p className="text-center text-xs text-zinc-500">
              No se detectaron coincidencias claras con las líneas del pedido. Revisa el texto o introduce los datos a
              mano.
            </p>
          ) : null}

          {ocrText ? (
            <details className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-bold text-zinc-600">Texto OCR (debug)</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-zinc-500">
                {ocrText}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
