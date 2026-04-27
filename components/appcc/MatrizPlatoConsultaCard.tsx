'use client';

import React, { useMemo } from 'react';
import type { AllergenMasterRow, CartaRecipeRow, RecipeAllergenRow } from '@/lib/appcc-allergens-supabase';
import {
  GLUTEN_OPTION_SHORT,
  MATRIZ_PRESENCE_LABEL,
  effectiveGlutenOption,
  glutenOptionBadgeClass,
  isRelevantMatrizPresence,
  matrizPresenceChipClass,
  resolveMatrizPresenceForAllergen,
  showGlutenOperationalBanner,
} from '@/lib/appcc-matriz-consulta';

type Props = {
  recipe: CartaRecipeRow;
  allergensMaster: AllergenMasterRow[];
  rowsByAllergenId: Map<string, RecipeAllergenRow | undefined>;
  onSelect: () => void;
};

export default function MatrizPlatoConsultaCard({ recipe, allergensMaster, rowsByAllergenId, onSelect }: Props) {
  const gOpt = effectiveGlutenOption(recipe.gluten_free_option);

  const relevantAllergens = useMemo(() => {
    return allergensMaster
      .map((a) => ({
        allergen: a,
        kind: resolveMatrizPresenceForAllergen(rowsByAllergenId, a.id),
      }))
      .filter(({ kind }) => isRelevantMatrizPresence(kind));
  }, [allergensMaster, rowsByAllergenId]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm ring-1 ring-zinc-100 transition hover:border-[#D32F2F]/35 hover:ring-[#D32F2F]/15 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#D32F2F]/40"
    >
      <h3 className="text-sm font-black leading-snug text-zinc-900 line-clamp-2">{recipe.name}</h3>
      {recipe.carta_category?.trim() ? (
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 line-clamp-1">
          {recipe.carta_category.trim()}
        </p>
      ) : null}

      <div
        className={[
          'mt-2 inline-flex w-full justify-center rounded-lg border px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide ring-1',
          glutenOptionBadgeClass(gOpt),
        ].join(' ')}
      >
        Sin gluten posible: {GLUTEN_OPTION_SHORT[gOpt]}
      </div>

      {showGlutenOperationalBanner(gOpt) ? (
        <p className="mt-1.5 rounded-md bg-amber-50 px-1.5 py-1 text-[9px] font-semibold leading-tight text-amber-950 ring-1 ring-amber-100">
          Confirmar disponibilidad y evitar contaminación cruzada.
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {relevantAllergens.length === 0 ? (
          <p className="w-full rounded-lg bg-zinc-50 px-2 py-1.5 text-center text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-100">
            Sin alérgenos declarados
          </p>
        ) : (
          relevantAllergens.map(({ allergen: a, kind }) => (
            <span
              key={a.id}
              className={[
                'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ring-1',
                matrizPresenceChipClass(kind),
              ].join(' ')}
            >
              <span className="font-extrabold">{a.name}</span>
              <span className="font-black tracking-wide">{MATRIZ_PRESENCE_LABEL[kind]}</span>
            </span>
          ))
        )}
      </div>

      <span className="mt-2 text-[9px] font-bold uppercase tracking-wide text-[#D32F2F]">Detalle</span>
    </button>
  );
}
