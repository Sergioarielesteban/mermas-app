'use client';

import { Search } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  filterInventorySupplierProductsByQuery,
  type InventorySupplierProductSearchRow,
} from '@/lib/inventory-supplier-pricing';

const UNIT_LABEL: Record<string, string> = {
  kg: 'kg',
  l: 'L',
  ud: 'ud',
  bolsa: 'bolsa',
  racion: 'ración',
  caja: 'caja',
  paquete: 'paquete',
  bandeja: 'bandeja',
};

export type SupplierProductSearchInputProps = {
  products: readonly InventorySupplierProductSearchRow[];
  value: string;
  onSelect: (product: InventorySupplierProductSearchRow) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
  maxResults?: number;
};

function formatLine(p: InventorySupplierProductSearchRow): string {
  const u = UNIT_LABEL[p.unit] ?? p.unit;
  const price = Number.isFinite(p.pricePerUnit) ? p.pricePerUnit.toFixed(2) : '—';
  return `${p.name} · ${p.supplierName} · ${price} €/${u}`;
}

/**
 * Buscador de artículo proveedor (catálogo pedidos) con autocompletado.
 */
export default function SupplierProductSearchInput({
  products,
  value,
  onSelect,
  onClear,
  disabled = false,
  className = '',
  maxResults = 15,
}: SupplierProductSearchInputProps) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => (value ? (products.find((p) => p.id === value) ?? null) : null),
    [products, value],
  );
  const showSelectedOnly = Boolean(value && selected);
  const showMissingOnly = Boolean(value && !selected);

  const results = useMemo(
    () => filterInventorySupplierProductsByQuery(products, query, maxResults),
    [products, query, maxResults],
  );

  const showList = open && !disabled && query.trim().length > 0;
  const noMatches = showList && results.length === 0;

  useLayoutEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (p: InventorySupplierProductSearchRow) => {
    onSelect(p);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onClear();
    setQuery('');
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${className} ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      {showSelectedOnly ? (
        <div className="mt-1 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-900" title={formatLine(selected!)}>
            {formatLine(selected!)}
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="shrink-0 text-sm font-bold text-[#D32F2F] underline"
          >
            Cambiar
          </button>
        </div>
      ) : null}

      {showMissingOnly ? (
        <div className="mb-2 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">
            Artículo proveedor no disponible en el catálogo
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="shrink-0 text-sm font-bold text-[#D32F2F] underline"
          >
            Cambiar
          </button>
        </div>
      ) : null}

      {showSelectedOnly ? null : (
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
            <Search className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <input
            ref={inputRef}
            id={`${baseId}-q`}
            type="text"
            autoComplete="off"
            placeholder="Buscar artículo proveedor…"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-11 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#D32F2F]/20"
            aria-autocomplete="list"
            aria-controls={`${baseId}-list`}
            aria-expanded={showList}
          />
          {showList ? (
            <ul
              id={`${baseId}-list`}
              role="listbox"
              className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
            >
              {noMatches ? (
                <li className="px-3 py-2 text-sm text-zinc-500">Sin resultados</li>
              ) : (
                results.map((p) => (
                  <li key={p.id} role="option">
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(p)}
                    >
                      <span className="font-semibold text-zinc-900">{p.name}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {p.supplierName}
                        {p.category ? ` · ${p.category}` : ''} ·{' '}
                        {Number.isFinite(p.pricePerUnit) ? p.pricePerUnit.toFixed(2) : '—'} €/
                        {UNIT_LABEL[p.unit] ?? p.unit}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
