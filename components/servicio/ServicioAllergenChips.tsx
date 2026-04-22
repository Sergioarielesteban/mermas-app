import React, { memo } from 'react';
import type { AllergenKey } from '@/lib/servicio/types';

const LABEL: Record<AllergenKey, string> = {
  gluten: 'G',
  lactosa: 'L',
  huevos: 'H',
  frutos_secos: 'FS',
  soja: 'S',
  pescado: 'P',
  moluscos: 'M',
};

function ServicioAllergenChipsInner({ keys }: { keys: readonly AllergenKey[] }) {
  if (!keys.length) {
    return <span className="text-[10px] font-semibold text-zinc-400">Sin alérgenos declarados</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span
          key={k}
          title={k.replace('_', ' ')}
          className="grid h-6 min-w-[1.25rem] place-items-center rounded-md bg-amber-100 px-1 text-[10px] font-extrabold text-amber-950 ring-1 ring-amber-200/80"
        >
          {LABEL[k]}
        </span>
      ))}
    </div>
  );
}

export default memo(ServicioAllergenChipsInner);
