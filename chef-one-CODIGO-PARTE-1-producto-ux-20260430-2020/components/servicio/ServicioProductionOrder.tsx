import React, { memo } from 'react';

const STEPS = ['Cremas y bases', 'Guarniciones', 'Proteínas', 'Emplatado'] as const;

function ServicioProductionOrderInner() {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-700">Orden de producción</p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-200"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#D32F2F]/10 text-sm font-extrabold text-[#B91C1C]">
              {i + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default memo(ServicioProductionOrderInner);
