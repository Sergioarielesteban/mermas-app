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
  parsePricePerKg,
  type EuroPerKgSuggestionSource,
} from '@/lib/pedidos-recepcion-inputs';
import {
  receptionBillsByWeight,
  receptionCalculationUnit,
  receptionLineTotals,
  resolveReceivedQuantityForReceptionPreview,
  resolveReceivedWeightKgForReceptionPreview,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

function buildPreviewItem(
  item: PedidoOrderItem,
  kgText: string,
  ppkText: string,
  priceText: string,
  orderQtyText: string,
  supplierPpk: number | null,
): PedidoOrderItem {
  let pricePu = item.pricePerUnit;
  const pr = priceText.trim().replace(',', '.');
  if (pr !== '') {
    const p = Number(pr);
    if (Number.isFinite(p) && p >= 0) pricePu = Math.round(p * 100) / 100;
  }

  if (receptionBillsByWeight(item)) {
    const kgForMerge: number | null = resolveReceivedWeightKgForReceptionPreview(item, kgText);

    let ppkMerge: number | null = item.receivedPricePerKg ?? null;
    if (item.unit !== 'kg') {
      const st = parsePricePerKg(ppkText);
      if (ppkText.trim() === '') ppkMerge = supplierPpk;
      else if (st !== 'invalid' && st != null) ppkMerge = st;
      else ppkMerge = item.receivedPricePerKg ?? supplierPpk;
    }

    const merged: PedidoOrderItem = {
      ...item,
      pricePerUnit: pricePu,
      receivedWeightKg: kgForMerge,
      ...(item.unit !== 'kg' ? { receivedPricePerKg: ppkMerge } : {}),
    };

    const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
    return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
  }

  const qMerge = resolveReceivedQuantityForReceptionPreview(item, orderQtyText);
  const merged: PedidoOrderItem = {
    ...item,
    pricePerUnit: pricePu,
    receivedQuantity: qMerge,
    receivedWeightKg: null,
    receivedPricePerKg: null,
  };
  const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
  return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
}

export type RecepcionLineRowProps = {
  orderId: string;
  item: PedidoOrderItem;
  /** Nombre operativo (catálogo proveedor). Si se omite, se usa `item.productName` (snapshot en línea). */
  lineDisplayName?: string;
  suggestedEuroPerKg: number | null;
  suggestionSource: EuroPerKgSuggestionSource | null;
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
    a.suggestionSource === b.suggestionSource
  );
}

function RecepcionLineRowInner({
  orderId,
  item,
  lineDisplayName,
  suggestedEuroPerKg,
  suggestionSource,
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
    () => buildPreviewItem(item, kgText, ppkText, priceText, orderQtyText, defaultPpk),
    [item, kgText, ppkText, priceText, orderQtyText, defaultPpk],
  );

  const lineSummary = React.useMemo(() => receptionBillingSummary(previewItem), [previewItem]);

  return (
    <div className="space-y-1 rounded-lg bg-white p-2 ring-1 ring-zinc-200">
      <p className="text-sm font-semibold leading-tight text-zinc-800">{lineDisplayName ?? item.productName}</p>
      <p className="text-xs text-zinc-600">
        Pedido:{' '}
        <span className="text-base font-bold tabular-nums text-zinc-900 sm:text-lg">
          {formatQuantityWithUnit(item.quantity, item.unit)}
        </span>
      </p>
      <div className="rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 py-1.5 text-[11px] leading-snug text-zinc-700">
        <p className="font-semibold text-zinc-500">Resumen albarán</p>
        <p className="mt-0.5">
          <span className="font-semibold text-zinc-500">Pedido</span> {lineSummary.pedido}
        </p>
        <p>
          <span className="font-semibold text-zinc-500">Recibido</span> {lineSummary.recibido}
        </p>
        <p>
          <span className="font-semibold text-zinc-500">Precio aplicado</span> {lineSummary.precioAplicado}
        </p>
        {lineSummary.precioEquivCatalogo ? (
          <p className="text-[10px] text-zinc-600">{lineSummary.precioEquivCatalogo}</p>
        ) : null}
        <p>
          <span className="font-semibold text-zinc-500">Total línea</span>{' '}
          <span className="font-bold tabular-nums text-zinc-900">{lineSummary.totalLinea}</span>
        </p>
      </div>
      {billsByWeight &&
      item.unit !== 'kg' &&
      item.estimatedKgPerUnit != null &&
      item.estimatedKgPerUnit > 0 ? (
        <p className="text-[11px] leading-tight text-zinc-600">
          Est. {(item.quantity * item.estimatedKgPerUnit).toFixed(2)} kg (
          {item.estimatedKgPerUnit.toFixed(2)} kg/{item.unit})
          {item.receivedQuantity > 0
            ? ` · recib.: ${(item.receivedQuantity * item.estimatedKgPerUnit).toFixed(2)} kg`
            : ''}
        </p>
      ) : null}
      <p className="text-[11px] leading-tight text-zinc-600">
        {item.basePricePerUnit != null && Number.isFinite(item.basePricePerUnit) ? (
          <>
            <span className="font-semibold text-zinc-500">p/base</span>{' '}
            <span className="font-semibold text-zinc-900">
              {item.basePricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
            </span>
            <span className="mx-1 text-zinc-300">·</span>
          </>
        ) : null}
        <span className="font-semibold text-zinc-500">p/alb</span>{' '}
        <span className="font-bold text-zinc-900">
          {item.pricePerUnit.toFixed(2)} €/{unitPriceCatalogSuffix[item.unit]}
        </span>
      </p>
      {item.basePricePerUnit != null &&
      Number.isFinite(item.basePricePerUnit) &&
      Math.abs(item.pricePerUnit - item.basePricePerUnit) > 0.005 ? (
        <p className="text-[10px] font-semibold leading-tight text-amber-900">
          Δ {item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}
          {(item.pricePerUnit - item.basePricePerUnit).toFixed(2)} €
          {item.basePricePerUnit > 0
            ? ` (${item.pricePerUnit >= item.basePricePerUnit ? '+' : ''}${(((item.pricePerUnit - item.basePricePerUnit) / item.basePricePerUnit) * 100).toFixed(1)} %)`
            : ''}
        </p>
      ) : null}
      {billsByWeight ? (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1">
              <label className="shrink-0 text-[11px] font-semibold text-zinc-600">Cantidad real ({calcSuffix})</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                placeholder="0,00"
                title="Peso en báscula; por defecto el estimado del pedido"
                value={kgText}
                onFocus={() => {
                  kgFocusedRef.current = true;
                }}
                onChange={(e) => setKgText(e.target.value)}
                onBlur={() => {
                  kgFocusedRef.current = false;
                  commitWeightInput(orderId, item.id, kgText, priceText);
                }}
                className="h-7 w-[4.25rem] max-w-[5.25rem] shrink-0 rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs font-semibold text-zinc-900 outline-none sm:w-[5.25rem] sm:max-w-[5.5rem]"
              />
            </div>
            {item.unit !== 'kg' ? (
              <div className="flex items-center gap-1">
                <label className="shrink-0 text-[11px] font-semibold text-zinc-600">€/kg</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder=""
                  title="€/kg reales; subtotal = kg × €/kg"
                  value={ppkText}
                  onFocus={() => {
                    ppkFocusedRef.current = true;
                  }}
                  onChange={(e) => setPpkText(e.target.value)}
                  onBlur={() => {
                    ppkFocusedRef.current = false;
                    commitPricePerKgInput(orderId, item.id, ppkText);
                  }}
                  className="h-7 w-14 max-w-[5.5rem] shrink-0 rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs font-semibold text-zinc-900 outline-none sm:w-[5rem]"
                />
              </div>
            ) : null}
          </div>
          {item.unit !== 'kg' ? (
            <div className="space-y-0.5 text-[10px] leading-tight text-zinc-500">
              {suggestionSource ? (
                <p className="text-zinc-600">{euroPerKgSuggestionHint(suggestionSource)}</p>
              ) : null}
              <p>
                {previewItem.receivedPricePerKg != null &&
                previewItem.receivedPricePerKg > 0 &&
                previewItem.receivedWeightKg != null &&
                previewItem.receivedWeightKg > 0
                  ? `Ref. ${previewItem.pricePerUnit.toFixed(2)} €/${unitPriceCatalogSuffix[item.unit]}`
                  : 'El subtotal es kg reales (o estimados) × €/kg. Abajo, precio de referencia por envase.'}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-50/50 px-2 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/90">Recepción (cantidad × precio)</p>
          <div className="mt-1.5 grid min-w-0 grid-cols-3 items-end gap-x-2 gap-y-1">
            <div className="min-w-0">
              <label className="mb-0.5 block text-[10px] font-semibold text-zinc-700">Cantidad real ({calcSuffix})</label>
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
                className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1.5 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-0.5 block text-[10px] font-semibold text-zinc-700">Precio real (€/{calcSuffix})</label>
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
                className="h-8 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1.5 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
              />
            </div>
            <div className="flex min-h-[3.15rem] min-w-0 flex-col justify-end rounded-md border border-emerald-300/70 bg-emerald-100/70 px-1.5 py-1">
              <span className="text-[10px] font-semibold text-emerald-900/85">Sub</span>
              <span className="text-right text-base font-black leading-tight tabular-nums text-emerald-950 sm:text-lg">
                {previewItem.lineTotal.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      )}
      {billsByWeight ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-100 pt-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <label className="shrink-0 text-[11px] font-semibold text-zinc-600">
              Precio recibido (€/{unitPriceCatalogSuffix[item.unit]})
            </label>
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
              className="h-8 w-[4.5rem] rounded-md border border-zinc-300 bg-white px-1.5 text-sm font-semibold tabular-nums text-zinc-900 outline-none"
            />
          </div>
          <span className="shrink-0 text-[11px] text-zinc-700">
            Subt:{' '}
            <span className="font-bold tabular-nums text-zinc-900">{previewItem.lineTotal.toFixed(2)} €</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default React.memo(RecepcionLineRowInner, recepcionLineRowPropsEqual);
