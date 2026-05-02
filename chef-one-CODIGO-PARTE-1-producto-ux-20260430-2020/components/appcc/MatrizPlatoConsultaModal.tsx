'use client';

import Link from 'next/link';
import React from 'react';
import { X } from 'lucide-react';
import type { AllergenMasterRow, CartaRecipeRow, RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import {
  GLUTEN_OPTION_SHORT,
  MATRIZ_PRESENCE_LABEL,
  effectiveGlutenOption,
  glutenOptionBadgeClass,
  matrizPresenceChipClass,
  resolveMatrizPresenceForAllergen,
  showGlutenOperationalBanner,
} from '@/lib/appcc-matriz-consulta';

type Props = {
  recipe: CartaRecipeRow;
  allergensMaster: AllergenMasterRow[];
  rowsByAllergenId: Map<string, RecipeAllergenRow | undefined>;
  isAdmin: boolean;
  onClose: () => void;
};

export default function MatrizPlatoConsultaModal({
  recipe,
  allergensMaster,
  rowsByAllergenId,
  isAdmin,
  onClose,
}: Props) {
  const gOpt = effectiveGlutenOption(recipe.gluten_free_option);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="matriz-plato-detalle-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col rounded-t-3xl border border-zinc-200 bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div className="min-w-0">
            <h2 id="matriz-plato-detalle-titulo" className="text-lg font-black leading-tight text-zinc-900">
              {recipe.name}
            </h2>
            {recipe.carta_category?.trim() ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-500">{recipe.carta_category.trim()}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Cerrar detalle"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!isAdmin ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-100">
              Solo consulta. Para editar alérgenos o el plato, usa la gestión (solo administración).
            </p>
          ) : null}
          <div
            className={[
              'rounded-2xl border px-3 py-2.5 text-center text-xs font-black uppercase tracking-wide ring-1',
              glutenOptionBadgeClass(gOpt),
            ].join(' ')}
          >
            SIN GLUTEN POSIBLE: {GLUTEN_OPTION_SHORT[gOpt]}
          </div>

          {showGlutenOperationalBanner(gOpt) ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-100">
              Confirmar disponibilidad y evitar contaminación cruzada.
            </p>
          ) : null}

          {recipe.gluten_free_option_note?.trim() ? (
            <div className="rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Motivo / orientación</p>
              <p className="mt-1 text-sm text-zinc-800">{recipe.gluten_free_option_note.trim()}</p>
            </div>
          ) : null}

          {recipe.gluten_cross_contamination_warning?.trim() ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 ring-1 ring-amber-100">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Contaminación cruzada</p>
              <p className="mt-1 text-sm font-medium text-amber-950">{recipe.gluten_cross_contamination_warning.trim()}</p>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Alérgenos declarados</p>
            <ul className="mt-2 space-y-2">
              {allergensMaster.map((a) => {
                const kind = resolveMatrizPresenceForAllergen(rowsByAllergenId, a.id);
                return (
                  <li
                    key={a.id}
                    className={[
                      'flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ring-1',
                      matrizPresenceChipClass(kind),
                    ].join(' ')}
                  >
                    <span>{a.name}</span>
                    <span className="text-[11px] font-black tracking-wide">{MATRIZ_PRESENCE_LABEL[kind]}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {recipe.allergens_reviewed_at ? (
            <p className="text-xs text-zinc-500">
              Última revisión de alérgenos:{' '}
              {new Date(recipe.allergens_reviewed_at).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Sin fecha de última revisión registrada.</p>
          )}

          {isAdmin ? (
            <Link
              href={`/appcc/carta-alergenos/${recipe.id}`}
              className="flex min-h-[48px] items-center justify-center rounded-2xl bg-zinc-900 px-4 text-sm font-bold text-white hover:bg-zinc-800"
              onClick={onClose}
            >
              Gestionar plato (administración)
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
