'use client';

import React from 'react';
import {
  formatQuantityWithUnit,
  receptionBillingSummary,
  unitPriceCatalogSuffix,
} from '@/lib/pedidos-format';
import {
  parsePricePerKg,
  parseReceivedKg,
  supplierDefaultPricePerKg,
  tryParseReceivedKgPreview,
} from '@/lib/pedidos-recepcion-inputs';
import {
  receptionLineTotals,
  unitCanDeclareScaleKgOnReception,
  unitSupportsReceivedWeightKg,
  type PedidoOrderItem,
} from '@/lib/pedidos-supabase';

function formatPpkForInput(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function buildPreviewItem(
  item: PedidoOrderItem,
  kgText: string,
  ppkText: string,
  priceText: string,
  supplierPpk: number | null,
): PedidoOrderItem {
  const strictKg = parseReceivedKg(kgText);
  const previewKg = tryParseReceivedKgPreview(kgText);

  let kgForMerge: number | null = item.receivedWeightKg ?? null;
  if (unitCanDeclareScaleKgOnReception(item.unit)) {
    if (kgText.trim() === '') kgForMerge = null;
    else if (strictKg === 'invalid') kgForMerge = item.receivedWeightKg ?? null;
    else kgForMerge = strictKg ?? previewKg ?? item.receivedWeightKg ?? null;
  }

  let ppkMerge: number | null = item.receivedPricePerKg ?? null;
  if (unitSupportsReceivedWeightKg(item.unit)) {
    const st = parsePricePerKg(ppkText);
    if (ppkText.trim() === '') ppkMerge = supplierPpk;
    else if (st !== 'invalid' && st != null) ppkMerge = st;
    else ppkMerge = item.receivedPricePerKg ?? supplierPpk;
  }

  let pricePu = item.pricePerUnit;
  const pr = priceText.trim().replace(',', '.');
  if (pr !== '') {
    const p = Number(pr);
    if (Number.isFinite(p) && p >= 0) pricePu = Math.round(p * 100) / 100;
  }

  const merged: PedidoOrderItem = {
    ...item,
    pricePerUnit: pricePu,
    receivedWeightKg: kgForMerge,
    ...(unitSupportsReceivedWeightKg(item.unit) ? { receivedPricePerKg: ppkMerge } : {}),
  };

  const { lineTotal, effectivePricePerUnit } = receptionLineTotals(merged);
  return { ...merged, pricePerUnit: effectivePricePerUnit, lineTotal };
}

export type RecepcionLineRowProps = {
  orderId: string;
  item: PedidoOrderItem;
  commitWeightInput: (orderId: string, itemId: string, rawKg: string, priceDraft?: string) => void;
  commitPricePerKgInput: (orderId: string, itemId: string, raw: string) => void;
  commitPriceInput: (orderId: string, itemId: string, raw: string) => void;
};

function recepcionLineRowPropsEqual(a: RecepcionLineRowProps, b: RecepcionLineRowProps): boolean {
  if (a.orderId !== b.orderId || a.item.id !== b.item.id) return false;
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
    x.billingUnit === y.billingUnit
  );
}

function RecepcionLineRowInner({
  orderId,
  item,
  commitWeightInput,
  commitPricePerKgInput,
  commitPriceInput,
}: RecepcionLineRowProps) {
  const supplierPpk = React.useMemo(() => supplierDefaultPricePerKg(item), [item]);

  const [kgText, setKgText] = React.useState('');
  const [ppkText, setPpkText] = React.useState(() => {
    if (item.receivedPricePerKg != null && item.receivedPricePerKg > 0) {
      return formatPpkForInput(item.receivedPricePerKg);
    }
    const sup0 = supplierDefaultPricePerKg(item);
    if (sup0 != null) return formatPpkForInput(sup0);
    return '';
  });
  const [priceText, setPriceText] = React.useState(() => item.pricePerUnit.toFixed(2));

  const priceFocusedRef = React.useRef(false);
  const ppkFocusedRef = React.useRef(false);

  React.useEffect(() => {
    if (priceFocusedRef.current) return;
    setPriceText(item.pricePerUnit.toFixed(2));
  }, [item.pricePerUnit, item.id]);

  React.useEffect(() => {
    if (ppkFocusedRef.current) return;
    if (item.receivedPricePerKg != null && item.receivedPricePerKg > 0) {
      setPpkText(formatPpkForInput(item.receivedPricePerKg));
      return;
    }
    const sup = supplierDefaultPricePerKg(item);
    setPpkText(sup != null ? formatPpkForInput(sup) : '');
  }, [item.receivedPricePerKg, item.pricePerUnit, item.estimatedKgPerUnit, item.unit, item.id]);

  const previewItem = React.useMemo(
    () => buildPreviewItem(item, kgText, ppkText, priceText, supplierPpk),
    [item, kgText, ppkText, priceText, supplierPpk],
  );

  const lineSummary = React.useMemo(() => receptionBillingSummary(previewItem), [previewItem]);

  return (
    <div className="space-y-1 rounded-lg bg-white p-2 ring-1 ring-zinc-200">
      <p className="text-sm font-semibold leading-tight text-zinc-800">{item.productName}</p>
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
      {unitSupportsReceivedWeightKg(item.unit) &&
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
      {unitCanDeclareScaleKgOnReception(item.unit) || unitSupportsReceivedWeightKg(item.unit) ? (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {unitCanDeclareScaleKgOnReception(item.unit) ? (
              <div className="flex items-center gap-1">
                <label className="shrink-0 text-[11px] font-semibold text-zinc-600">Kg</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder="0,00"
                  title="Kg reales"
                  value={kgText}
                  onChange={(e) => setKgText(e.target.value)}
                  onBlur={() => commitWeightInput(orderId, item.id, kgText, priceText)}
                  className="h-7 w-[3.25rem] max-w-[3.25rem] shrink-0 rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs font-semibold text-zinc-900 outline-none sm:w-[4rem] sm:max-w-[4rem]"
                />
              </div>
            ) : null}
            {unitSupportsReceivedWeightKg(item.unit) ? (
              <div className="flex items-center gap-1">
                <label className="shrink-0 text-[11px] font-semibold text-zinc-600">€/kg</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder="0,00"
                  title="€/kg real"
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
          {unitSupportsReceivedWeightKg(item.unit) ? (
            <p className="text-[10px] leading-tight text-zinc-500">
              {previewItem.receivedPricePerKg != null &&
              previewItem.receivedPricePerKg > 0 &&
              previewItem.receivedWeightKg != null &&
              previewItem.receivedWeightKg > 0
                ? `≈ ${previewItem.pricePerUnit.toFixed(2)} €/${unitPriceCatalogSuffix[item.unit]}`
                : '€/kg opcional si hay kg reales.'}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-100 pt-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <label className="shrink-0 text-[11px] font-semibold text-zinc-600">Precio recibido</label>
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
    </div>
  );
}

export default React.memo(RecepcionLineRowInner, recepcionLineRowPropsEqual);
