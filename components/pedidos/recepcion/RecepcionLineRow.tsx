'use client';

import React from 'react';
import {
  formatQuantityWithUnit,
  receptionBillingSummary,
  unitPriceCatalogSuffix,
} from '@/lib/pedidos-format';
import {
  euroPerKgSuggestionHint,
  formatKgInputDisplay,
  formatPpkInputDisplay,
  getDefaultReceivedKgNumeric,
  getDefaultReceivedOrderQtyNumeric,
  type EuroPerKgSuggestionSource,
} from '@/lib/pedidos-recepcion-inputs';
import {
  formatReceptionPriceAlertSingleLine,
  receptionPriceAlertFromPreview,
} from '@/lib/pedidos-reception-price-alert';
import { parsePriceInput } from '@/lib/money-format';
import { buildPedidoReceptionPreviewItem } from '@/lib/pedidos-reception-preview-item';
import {
  receptionBillsByWeight,
  receptionCalculationUnit,
  resolveReceivedQuantityForReceptionPreview,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

export type RecepcionLineRowProps = {
  orderId: string;
  item: PedidoOrderItem;
  /** Nombre operativo (catálogo proveedor). Si se omite, se usa `item.productName` (snapshot en línea). */
  lineDisplayName?: string;
  suggestedEuroPerKg: number | null;
  suggestionSource: EuroPerKgSuggestionSource | null;
  /** Último precio comparable en `historico_precios` (misma unidad que evolución). */
  lastHistoricoComparable?: { precio: number; unidad: string } | null;
  /** Incrementa cuando el padre termina de cargar pistas/histórico (invalida React.memo). */
  priceHintsVersion?: number;
  commitWeightInput: (orderId: string, itemId: string, rawKg: string, priceDraft?: string) => void;
  commitReceivedOrderQtyInput: (orderId: string, itemId: string, rawQty: string, priceDraft?: string) => void;
  commitPricePerKgInput: (orderId: string, itemId: string, raw: string) => void;
  commitPriceInput: (orderId: string, itemId: string, raw: string) => void;
};

function recepcionLineRowPropsEqual(a: RecepcionLineRowProps, b: RecepcionLineRowProps): boolean {
  if (a.orderId !== b.orderId || a.item.id !== b.item.id) return false;
  if (a.lineDisplayName !== b.lineDisplayName) return false;
  const x = a.item;
  const y = b.item;
  return (
    x.productName === y.productName &&
    x.quantity === y.quantity &&
    x.unit === y.unit &&
    x.receivedQuantity === y.receivedQuantity &&
    x.receivedWeightKg === y.receivedWeightKg &&
    x.receivedPricePerKg === y.receivedPricePerKg &&
    x.pricePerUnit === y.pricePerUnit &&
    x.lineTotal === y.lineTotal &&
    x.basePricePerUnit === y.basePricePerUnit &&
    x.estimatedKgPerUnit === y.estimatedKgPerUnit &&
    x.incidentType === y.incidentType &&
    x.incidentNotes === y.incidentNotes &&
    x.billingUnit === y.billingUnit &&
    x.billingQtyPerOrderUnit === y.billingQtyPerOrderUnit &&
    a.suggestedEuroPerKg === b.suggestedEuroPerKg &&
    a.suggestionSource === b.suggestionSource &&
    a.lastHistoricoComparable?.precio === b.lastHistoricoComparable?.precio &&
    a.lastHistoricoComparable?.unidad === b.lastHistoricoComparable?.unidad &&
    (a.priceHintsVersion ?? 0) === (b.priceHintsVersion ?? 0)
  );
}

function RecepcionLineRowInner({
  orderId,
  item,
  lineDisplayName,
  suggestedEuroPerKg,
  suggestionSource,
  lastHistoricoComparable = null,
  priceHintsVersion = 0,
  commitWeightInput,
  commitReceivedOrderQtyInput,
  commitPricePerKgInput,
  commitPriceInput,
}: RecepcionLineRowProps) {
  const defaultPpk = suggestedEuroPerKg;
  const billsByWeight = receptionBillsByWeight(item);
  const calcU = receptionCalculationUnit(item);
  const calcSuffix = unitPriceCatalogSuffix[calcU];

  const commitWeightRef = React.useRef(commitWeightInput);
  commitWeightRef.current = commitWeightInput;

  const [kgText, setKgText] = React.useState(() => {
    const n = getDefaultReceivedKgNumeric(item);
    return n != null ? formatKgInputDisplay(n) : '';
  });
  const [orderQtyText, setOrderQtyText] = React.useState(() => {
    const n = getDefaultReceivedOrderQtyNumeric(item);
    return formatKgInputDisplay(n);
  });
  const [ppkText, setPpkText] = React.useState(() => {
    if (item.receivedPricePerKg != null && item.receivedPricePerKg > 0) {
      return formatPpkInputDisplay(item.receivedPricePerKg);
    }
    if (suggestedEuroPerKg != null) return formatPpkInputDisplay(suggestedEuroPerKg);
    return '';
  });
  const [priceText, setPriceText] = React.useState(() => item.pricePerUnit.toFixed(2));

  const priceFocusedRef = React.useRef(false);
  const ppkFocusedRef = React.useRef(false);
  const kgFocusedRef = React.useRef(false);
  const orderQtyFocusedRef = React.useRef(false);
  const autoDefaultKgPersistedRef = React.useRef(false);

  React.useEffect(() => {
    autoDefaultKgPersistedRef.current = false;
  }, [item.id]);

  /**
   * Si aún no hay kg en BD, persistir una vez el total estimado (cantidad × kg/unidad)
   * para que €/kg y totales usen la misma base sin obligar a blur manual.
   */
  React.useEffect(() => {
    if (!billsByWeight) return;
    if (item.receivedWeightKg != null && item.receivedWeightKg > 0) return;
    if (autoDefaultKgPersistedRef.current) return;
    let n: number | null = null;
    if (
      item.unit !== 'kg' &&
      item.estimatedKgPerUnit != null &&
      item.estimatedKgPerUnit > 0 &&
      item.quantity > 0
    ) {
      n = Math.round(item.quantity * item.estimatedKgPerUnit * 1000) / 1000;
    } else if (item.unit === 'kg' && item.quantity > 0) {
      n = Math.round(item.quantity * 1000) / 1000;
    }
    if (n == null) return;
    autoDefaultKgPersistedRef.current = true;
    commitWeightRef.current(orderId, item.id, formatKgInputDisplay(n), item.pricePerUnit.toFixed(2));
  }, [billsByWeight, orderId, item.id, item.unit, item.quantity, item.estimatedKgPerUnit, item.receivedWeightKg, item.pricePerUnit]);

  React.useEffect(() => {
    if (priceFocusedRef.current) return;
    setPriceText(item.pricePerUnit.toFixed(2));
  }, [item.pricePerUnit, item.id]);

  React.useEffect(() => {
    if (kgFocusedRef.current) return;
    const n = getDefaultReceivedKgNumeric(item);
    setKgText(n != null ? formatKgInputDisplay(n) : '');
  }, [item.id, item.receivedWeightKg, item.quantity, item.estimatedKgPerUnit, item.unit, billsByWeight]);

  React.useEffect(() => {
    if (orderQtyFocusedRef.current) return;
    setOrderQtyText(formatKgInputDisplay(getDefaultReceivedOrderQtyNumeric(item)));
  }, [item.id, item.receivedQuantity, item.quantity, item.incidentType, billsByWeight]);

  React.useEffect(() => {
    if (ppkFocusedRef.current) return;
    if (item.receivedPricePerKg != null && item.receivedPricePerKg > 0) {
      setPpkText(formatPpkInputDisplay(item.receivedPricePerKg));
      return;
    }
    setPpkText(defaultPpk != null ? formatPpkInputDisplay(defaultPpk) : '');
  }, [item.receivedPricePerKg, item.id, defaultPpk]);

  const previewItem = React.useMemo(
    () =>
      buildPedidoReceptionPreviewItem(item, {
        weightDraft: kgText,
        ppkDraft: ppkText,
        orderQtyDraft: orderQtyText,
        priceDraft: priceText,
        ppkSuggestion: defaultPpk,
      }),
    [item, kgText, ppkText, priceText, orderQtyText, defaultPpk],
  );

  const lineSummary = React.useMemo(() => receptionBillingSummary(previewItem), [previewItem]);

  const receptionPriceAlert = React.useMemo(
    () => receptionPriceAlertFromPreview(previewItem, lastHistoricoComparable),
    [previewItem, lastHistoricoComparable, priceHintsVersion],
  );

  const draftPriceUi = parsePriceInput(priceText) ?? item.pricePerUnit;
  const recvQtyForDiff = !billsByWeight
    ? resolveReceivedQuantityForReceptionPreview({ ...item, pricePerUnit: draftPriceUi }, orderQtyText)
    : null;
  const qtyDeltaUi = recvQtyForDiff != null ? recvQtyForDiff - item.quantity : 0;

  const orderSubtitle =
    item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit)
      ? `Pedido: ${formatQuantityWithUnit(item.quantity, item.unit)} · ${item.basePricePerUnit.toFixed(2)} €/${unitPriceCatalogSuffix[item.unit]}`
      : `Pedido: ${formatQuantityWithUnit(item.quantity, item.unit)}`;

  const hasIncident = Boolean(item.incidentType || item.incidentNotes?.trim());
  const shellTone = hasIncident
    ? 'ring-amber-300/55 bg-amber-50/35 border-amber-100/80'
    : receptionPriceAlert?.direction === 'up'
      ? 'ring-orange-200/70 bg-white border-orange-100/60'
      : 'ring-emerald-200/45 bg-white border-emerald-100/50';

  /** Menos “caja”: relieve suave en bloque único; inputs sin doble recuadro. */
  const inputCls =
    'h-7 min-w-0 rounded-md bg-white px-1.5 text-[12px] font-semibold tabular-nums text-zinc-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] outline-none ring-1 ring-zinc-200/55 transition-shadow focus:ring-2 focus:ring-[#D32F2F]/28';

  const blockCls = 'mt-1 rounded-lg bg-zinc-50/55 p-1 ring-1 ring-zinc-100/85';

  const subCls =
    'ml-auto flex min-w-[4.75rem] shrink-0 flex-col items-end justify-end rounded-md bg-emerald-50/90 px-1.5 py-0.5 ring-1 ring-emerald-200/35';

  return (
    <div className={['rounded-xl border p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]', shellTone].join(' ')}>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold leading-snug text-zinc-900 [overflow-wrap:anywhere]">
          {lineDisplayName ?? item.productName}
        </p>
        <p className="mt-px text-[10px] leading-tight text-zinc-500">{orderSubtitle}</p>
        <p className="mt-0.5 text-[9px] leading-tight text-zinc-500">
          <span className="font-medium text-zinc-400">Albarán</span> {lineSummary.pedido}
          <span className="text-zinc-300"> · </span>
          {lineSummary.recibido}
          <span className="text-zinc-300"> · </span>
          <span className="tabular-nums text-zinc-600">{lineSummary.totalLinea}</span>
        </p>
      </div>
      {billsByWeight &&
      item.unit !== 'kg' &&
      item.estimatedKgPerUnit != null &&
      item.estimatedKgPerUnit > 0 ? (
        <p className="mt-0.5 text-[9px] leading-tight text-zinc-500">
          Est. {(item.quantity * item.estimatedKgPerUnit).toFixed(2)} kg · {item.estimatedKgPerUnit.toFixed(2)} kg/{item.unit}
          {item.receivedQuantity > 0
            ? ` · recib.: ${(item.receivedQuantity * item.estimatedKgPerUnit).toFixed(2)} kg`
            : ''}
        </p>
      ) : null}
      {billsByWeight ? (
        <div className={blockCls}>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <div className="flex min-w-[4.25rem] flex-col gap-px">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">{calcSuffix}</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                placeholder="0,00"
                title="Peso en báscula"
                value={kgText}
                onFocus={() => {
                  kgFocusedRef.current = true;
                }}
                onChange={(e) => setKgText(e.target.value)}
                onBlur={() => {
                  kgFocusedRef.current = false;
                  commitWeightInput(orderId, item.id, kgText, priceText);
                }}
                className={`${inputCls} w-[4.5rem] shrink-0`}
              />
            </div>
            {item.unit !== 'kg' ? (
              <div className="flex min-w-[3.75rem] flex-col gap-px">
                <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">€/kg</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder=""
                  title="€/kg reales"
                  value={ppkText}
                  onFocus={() => {
                    ppkFocusedRef.current = true;
                  }}
                  onChange={(e) => setPpkText(e.target.value)}
                  onBlur={() => {
                    ppkFocusedRef.current = false;
                    commitPricePerKgInput(orderId, item.id, ppkText);
                  }}
                  className={`${inputCls} w-[4rem] shrink-0`}
                />
              </div>
            ) : null}
            <div className={subCls}>
              <span className="text-[8px] font-medium uppercase tracking-wide text-emerald-900/75">Subtotal</span>
              <span className="text-[14px] font-black tabular-nums leading-none text-emerald-950">
                {previewItem.lineTotal.toFixed(2)} €
              </span>
            </div>
          </div>
          {item.unit !== 'kg' ? (
            <p className="mt-0.5 text-[8px] leading-tight text-zinc-400">
              {suggestionSource ? (
                <span className="text-zinc-500">{euroPerKgSuggestionHint(suggestionSource)} · </span>
              ) : null}
              <span>
                {previewItem.receivedPricePerKg != null &&
                previewItem.receivedPricePerKg > 0 &&
                previewItem.receivedWeightKg != null &&
                previewItem.receivedWeightKg > 0
                  ? `Ref. ${previewItem.pricePerUnit.toFixed(2)} €/${unitPriceCatalogSuffix[item.unit]}`
                  : 'kg × €/kg; precio por ud. debajo'}
              </span>
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-0.5 border-t border-zinc-200/40 pt-1">
            <div className="flex min-w-0 flex-1 flex-col gap-px sm:max-w-[9.5rem]">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">
                €/{unitPriceCatalogSuffix[item.unit]}
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={priceText}
                onFocus={() => {
                  priceFocusedRef.current = true;
                }}
                onChange={(e) => setPriceText(e.target.value)}
                onBlur={() => {
                  priceFocusedRef.current = false;
                  commitPriceInput(orderId, item.id, priceText);
                }}
                className={`${inputCls} w-full max-w-[7.5rem]`}
              />
            </div>
          </div>
          {receptionPriceAlert ? (
            <p
              className={[
                'mt-1 text-[10px] font-medium leading-snug',
                receptionPriceAlert.direction === 'up' ? 'text-[#9f1239]' : 'text-emerald-900',
              ].join(' ')}
              role="status"
            >
              {formatReceptionPriceAlertSingleLine(receptionPriceAlert)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={blockCls}>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <div className="flex min-w-[4.75rem] flex-1 flex-col gap-px">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">Cantidad</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                placeholder="0"
                value={orderQtyText}
                onFocus={() => {
                  orderQtyFocusedRef.current = true;
                }}
                onChange={(e) => setOrderQtyText(e.target.value)}
                onBlur={() => {
                  orderQtyFocusedRef.current = false;
                  commitReceivedOrderQtyInput(orderId, item.id, orderQtyText, priceText);
                }}
                className={`${inputCls} w-full min-w-0`}
              />
            </div>
            <div className="flex min-w-[4.75rem] flex-1 flex-col gap-px">
              <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-400">€/{calcSuffix}</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={priceText}
                onFocus={() => {
                  priceFocusedRef.current = true;
                }}
                onChange={(e) => setPriceText(e.target.value)}
                onBlur={() => {
                  priceFocusedRef.current = false;
                  commitPriceInput(orderId, item.id, priceText);
                }}
                className={`${inputCls} w-full min-w-0`}
              />
            </div>
            <div className={subCls}>
              <span className="text-[8px] font-medium uppercase tracking-wide text-emerald-900/75">Subtotal</span>
              <span className="text-[14px] font-black tabular-nums leading-none text-emerald-950">
                {previewItem.lineTotal.toFixed(2)} €
              </span>
            </div>
          </div>
          {Math.abs(qtyDeltaUi) > 1e-6 ? (
            <p className="mt-0.5 text-[9px] font-medium text-orange-800/95">
              Dif. cantidad: {qtyDeltaUi > 0 ? '+' : '−'}
              {formatQuantityWithUnit(Math.abs(qtyDeltaUi), item.unit)}
            </p>
          ) : null}
          {receptionPriceAlert ? (
            <p
              className={[
                'mt-0.5 text-[10px] font-medium leading-snug',
                receptionPriceAlert.direction === 'up' ? 'text-[#9f1239]' : 'text-emerald-900',
              ].join(' ')}
              role="status"
            >
              {formatReceptionPriceAlertSingleLine(receptionPriceAlert)}
            </p>
          ) : null}
        </div>
      )}
      {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit)
        ? (() => {
            const draft = parsePriceInput(priceText);
            const base = item.basePricePerUnit;
            if (draft == null || Math.abs(draft - base) <= 0.005) return null;
            return (
              <p className="text-[10px] font-semibold leading-tight text-amber-900">
                Diferencia: {draft >= base ? '+' : ''}
                {(draft - base).toFixed(2)} € vs pedido
                {base > 0
                  ? ` (${draft >= base ? '+' : ''}${(((draft - base) / base) * 100).toFixed(1)} %)`
                  : ''}
              </p>
            );
          })()
        : null}
    </div>
  );
}

export default React.memo(RecepcionLineRowInner, recepcionLineRowPropsEqual);
