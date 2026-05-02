'use client';

import { Search } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { filterPurchaseArticlesByName } from '@/lib/purchase-articles-search';
import type { PurchaseArticle } from '@/lib/purchase-articles-supabase';

export type MasterArticleSearchInputProps = {
  articles: readonly PurchaseArticle[];
  /** `purchase_articles.id` o cadena vacía */
  value: string;
  onSelect: (article: PurchaseArticle) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
  maxResults?: number;
};

const NO_RESULTS = 'No encontrado';

/**
 * Buscador de artículo máster con autocompletado (no usa &lt;select&gt;).
 */
export default function MasterArticleSearchInput({
  articles,
  value,
  onSelect,
  onClear,
  disabled = false,
  className = '',
  maxResults = 15,
}: MasterArticleSearchInputProps) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => (value ? (articles.find((a) => a.id === value) ?? null) : null),
    [articles, value],
  );
  const showSelectedOnly = Boolean(value && selected);
  const showMissingOnly = Boolean(value && !selected);

  const results = useMemo(
    () => filterPurchaseArticlesByName(articles, query, maxResults),
    [articles, query, maxResults],
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

  const pick = (a: PurchaseArticle) => {
    onSelect(a);
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
          <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-900" title={selected?.nombre}>
            {selected?.nombre}
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
          <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">Artículo no disponible en el catálogo</p>
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
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            placeholder="Buscar ingrediente..."
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length > 0) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm font-medium text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            role="combobox"
            aria-expanded={showList}
            aria-autocomplete="list"
            aria-controls={`${baseId}-listbox`}
          />
          {showList ? (
            <ul
              id={`${baseId}-listbox`}
              role="listbox"
              className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
            >
              {noMatches ? (
                <li className="px-3 py-2.5 text-sm text-zinc-500" role="presentation">
                  {NO_RESULTS}
                </li>
              ) : (
                results.map((a) => (
                  <li key={a.id} role="option">
                    <button
                      type="button"
                      className="w-full cursor-pointer px-3 py-2.5 text-left text-sm text-zinc-900 hover:bg-zinc-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(a)}
                    >
                      {a.nombre}
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
