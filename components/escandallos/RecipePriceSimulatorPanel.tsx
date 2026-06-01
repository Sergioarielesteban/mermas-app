'use client';

import React, { useMemo, useState } from 'react';
import { parsePriceInput, formatMoneyEur } from '@/lib/money-format';
import {
  CHEF_ONE_FOOD_COST_TARGET_PCT,
  POSITIONING_FC_TARGETS,
  POSITIONING_LABELS,
  POSITIONING_SUBTITLES,
  buildActualPriceSnapshot,
  buildSimulatedPriceSnapshot,
  comparePriceSnapshots,
  compareToChefOneTarget,
  isValidFoodCostTargetPct,
  isValidMarginTargetPct,
  type ChefOneTargetComparison,
  type FamilyComparison,
  type FamilyPriceBenchmark,
  type PositioningPreset,
  type PriceSimulatorMode,
} from '@/lib/escandallo-price-simulator';

// ─── Props ────────────────────────────────────────────────────────────────────

export type RecipePriceSimulatorPanelProps = {
  totalCostEur: number;
  yieldQty: number;
  vatRatePct: number;
  currentPvpGrossEur: number | null;
  familyName: string | null;
  familyBenchmark: FamilyPriceBenchmark | null;
  familyComparison: FamilyComparison | null;
  hasIngredients: boolean;
  readonly?: boolean;
  demoReadonly?: boolean;
  onApplyRecommendedPvp?: (pvpGrossEur: number) => void;
  onEditRecipe?: () => void;
  className?: string;
};

// ─── Helpers de formato ───────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v * 10) / 10} %`;
}

function fmtDelta(v: number | null, unit: string): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${Math.round(v * 10) / 10}${unit}`;
}

// ─── Colores semáforo ─────────────────────────────────────────────────────────

function fcColor(pct: number | null): string {
  if (pct == null) return '#a1a1aa';
  if (pct <= 30) return '#4A6B3A';
  if (pct <= 35) return '#B8872A';
  return '#C4531F';
}

function fcTextClass(pct: number | null): string {
  if (pct == null) return 'text-zinc-400';
  if (pct <= 30) return 'text-[#4A6B3A]';
  if (pct <= 35) return 'text-[#B8872A]';
  return 'text-[#C4531F]';
}

function deltaTextClass(delta: number | null, inverse = false): string {
  if (delta == null) return 'text-zinc-400';
  const good = inverse ? delta > 0 : delta < 0;
  const bad = inverse ? delta < 0 : delta > 0;
  if (Math.abs(delta) < 0.05) return 'text-zinc-500';
  if (good) return 'text-[#4A6B3A]';
  if (bad && Math.abs(delta) > 5) return 'text-[#C4531F]';
  return 'text-[#B8872A]';
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function BarLine({ pct, color }: { pct: number | null; color: string }) {
  const width = pct != null ? `${Math.min(100, Math.max(4, pct / 50 * 100))}%` : '0%';
  return (
    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-zinc-100">
      <span className="block h-full rounded-full transition-all duration-300" style={{ width, backgroundColor: color }} />
    </span>
  );
}

function MetricRow({
  label,
  value,
  valueClass = 'text-zinc-900',
  sub,
  subClass = 'text-zinc-400',
  barPct,
  barColor,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string | null;
  subClass?: string;
  barPct?: number | null;
  barColor?: string;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</span>
        <span className={`font-mono text-[13px] font-bold tabular-nums ${valueClass}`}>{value}</span>
      </div>
      {sub ? <p className={`mt-0.5 text-right text-[10px] font-medium ${subClass}`}>{sub}</p> : null}
      {barPct != null ? <BarLine pct={barPct} color={barColor ?? '#a1a1aa'} /> : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">{children}</p>
  );
}

// ─── Segment control ──────────────────────────────────────────────────────────

const MODE_LABELS: Record<PriceSimulatorMode, string> = {
  pvp_manual: 'PVP manual',
  food_cost_target: 'FC objetivo',
  margin_target: 'Margen',
  positioning: 'Posicionamiento',
};

function ModeSegment({
  mode,
  active,
  onClick,
}: {
  mode: PriceSimulatorMode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition',
        active
          ? 'bg-[#4A6B3A] text-white shadow-sm'
          : 'text-zinc-500 hover:bg-zinc-100',
      ].join(' ')}
    >
      {MODE_LABELS[mode]}
    </button>
  );
}

// ─── Bloque objetivo Chef One ─────────────────────────────────────────────────

function ChefOneBlock({ comparison }: { comparison: ChefOneTargetComparison }) {
  const toneClass =
    comparison.tone === 'below'
      ? 'text-[#4A6B3A]'
      : comparison.tone === 'aligned'
        ? 'text-zinc-500'
        : comparison.tone === 'above' && comparison.deltaFoodCostPp != null && comparison.deltaFoodCostPp > 5
          ? 'text-[#C4531F]'
          : 'text-[#B8872A]';

  return (
    <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/60">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Objetivo Chef One</span>
        <span className="font-mono text-[12px] font-bold tabular-nums text-zinc-600">
          {CHEF_ONE_FOOD_COST_TARGET_PCT} %
        </span>
      </div>
      {comparison.message ? (
        <p className={`mt-1 text-[11px] font-semibold ${toneClass}`}>{comparison.message}</p>
      ) : null}
    </div>
  );
}

// ─── Bloque comparativa familia ───────────────────────────────────────────────

function FamilyBlock({
  benchmark,
  comparison,
  familyName,
}: {
  benchmark: FamilyPriceBenchmark;
  comparison: FamilyComparison | null;
  familyName: string;
}) {
  if (!benchmark.sufficient) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-zinc-200 px-3 py-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Media familia {familyName}
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">Sin datos suficientes de esta familia.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200/80">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-3 py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">
          Media familia {familyName} · {benchmark.fcSampleCount} platos
        </p>
      </div>
      <div className="divide-y divide-zinc-100 px-3">
        {benchmark.avgFoodCostPct != null && (
          <div className="flex items-baseline justify-between gap-2 py-2">
            <span className="text-[10px] text-zinc-400">FC medio</span>
            <span className={`font-mono text-[12px] font-bold tabular-nums ${fcTextClass(benchmark.avgFoodCostPct)}`}>
              {fmtPct(benchmark.avgFoodCostPct)}
            </span>
          </div>
        )}
        {benchmark.avgMarginPct != null && (
          <div className="flex items-baseline justify-between gap-2 py-2">
            <span className="text-[10px] text-zinc-400">Margen medio</span>
            <span className="font-mono text-[12px] font-bold tabular-nums text-zinc-700">
              {fmtPct(benchmark.avgMarginPct)}
            </span>
          </div>
        )}
        {benchmark.avgPvpGrossEur != null && (
          <div className="flex items-baseline justify-between gap-2 py-2">
            <span className="text-[10px] text-zinc-400">PVP medio</span>
            <span className="font-mono text-[12px] font-bold tabular-nums text-zinc-700">
              {formatMoneyEur(benchmark.avgPvpGrossEur)}
            </span>
          </div>
        )}
      </div>
      {comparison?.foodCostMessage && (
        <div className="border-t border-zinc-100 px-3 py-2">
          <p
            className={`text-[11px] font-semibold ${
              comparison.deltaFoodCostPp != null && comparison.deltaFoodCostPp > 0
                ? 'text-[#B8872A]'
                : comparison.deltaFoodCostPp != null && comparison.deltaFoodCostPp < 0
                  ? 'text-[#4A6B3A]'
                  : 'text-zinc-500'
            }`}
          >
            {comparison.foodCostMessage}
          </p>
          {comparison.marginMessage && (
            <p className="mt-0.5 text-[10px] text-zinc-400">{comparison.marginMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export default function RecipePriceSimulatorPanel({
  totalCostEur,
  yieldQty,
  vatRatePct,
  currentPvpGrossEur,
  familyName,
  familyBenchmark,
  familyComparison,
  hasIngredients,
  readonly = false,
  demoReadonly = false,
  onApplyRecommendedPvp,
  onEditRecipe,
  className = '',
}: RecipePriceSimulatorPanelProps) {
  const [mode, setMode] = useState<PriceSimulatorMode>('positioning');
  const [pvpInput, setPvpInput] = useState('');
  const [fcInput, setFcInput] = useState('30');
  const [marginInput, setMarginInput] = useState('70');
  const [preset, setPreset] = useState<PositioningPreset>('equilibrado');

  const actual = useMemo(
    () => buildActualPriceSnapshot({ totalCostEur, yieldQty, vatRatePct, pvpGrossEur: currentPvpGrossEur }),
    [totalCostEur, yieldQty, vatRatePct, currentPvpGrossEur],
  );

  const chefOneComparison = useMemo(
    () => compareToChefOneTarget(actual.foodCostPct),
    [actual.foodCostPct],
  );

  const simulatedInput = useMemo(() => {
    const base = { totalCostEur, yieldQty, vatRatePct, mode };
    if (mode === 'pvp_manual') {
      return { ...base, pvpGrossEur: parsePriceInput(pvpInput) };
    }
    if (mode === 'food_cost_target') {
      return { ...base, foodCostTargetPct: parsePriceInput(fcInput) };
    }
    if (mode === 'margin_target') {
      return { ...base, marginTargetPct: parsePriceInput(marginInput) };
    }
    return { ...base, positioningPreset: preset };
  }, [totalCostEur, yieldQty, vatRatePct, mode, pvpInput, fcInput, marginInput, preset]);

  const simulated = useMemo(() => buildSimulatedPriceSnapshot(simulatedInput), [simulatedInput]);
  const comparison = useMemo(() => comparePriceSnapshots(actual, simulated), [actual, simulated]);

  const canApply =
    !readonly && !demoReadonly && simulated.valid && simulated.pvpGrossEur != null && !!onApplyRecommendedPvp;

  const disabled = !hasIngredients;

  const inputClass =
    'h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 font-mono text-[13px] font-bold tabular-nums text-zinc-900 outline-none focus:ring-2 focus:ring-[#4A6B3A]/20 disabled:opacity-50';

  return (
    <div className={`overflow-hidden rounded-2xl bg-[#F7F3EE] ring-1 ring-zinc-200/70 ${className}`}>
      {/* Cabecera */}
      <div className="border-b border-zinc-200/60 bg-white px-4 py-3">
        <p className="font-serif text-[1rem] font-normal leading-tight text-zinc-950">Precio recomendado</p>
        <p className="mt-0.5 text-[10px] text-zinc-400">
          Calcula el PVP ideal según coste, food cost y margen objetivo.
        </p>
      </div>

      {disabled ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[12px] font-medium text-zinc-400">Añade ingredientes para simular.</p>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-3">

          {/* Segment control */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {(['pvp_manual', 'food_cost_target', 'margin_target', 'positioning'] as PriceSimulatorMode[]).map(
              (m) => (
                <ModeSegment key={m} mode={m} active={mode === m} onClick={() => setMode(m)} />
              ),
            )}
          </div>

          {/* Input activo */}
          <div className="mt-3">
            {mode === 'pvp_manual' && (
              <div>
                <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.16em] text-zinc-400">
                  PVP (€ IVA incl.)
                </label>
                <input
                  inputMode="decimal"
                  value={pvpInput}
                  onChange={(e) => setPvpInput(e.target.value)}
                  placeholder={currentPvpGrossEur != null ? String(currentPvpGrossEur) : '0,00'}
                  className={inputClass}
                />
              </div>
            )}
            {mode === 'food_cost_target' && (
              <div>
                <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.16em] text-zinc-400">
                  Food Cost objetivo (%)
                </label>
                <input
                  inputMode="decimal"
                  value={fcInput}
                  onChange={(e) => setFcInput(e.target.value)}
                  className={inputClass}
                />
                {(() => {
                  const v = parsePriceInput(fcInput);
                  return v != null && !isValidFoodCostTargetPct(v) ? (
                    <p className="mt-1 text-[11px] text-[#C4531F]">FC debe estar entre 0,1 % y 99,9 %.</p>
                  ) : null;
                })()}
              </div>
            )}
            {mode === 'margin_target' && (
              <div>
                <label className="mb-1 block text-[9px] font-black uppercase tracking-[0.16em] text-zinc-400">
                  Margen objetivo (%)
                </label>
                <input
                  inputMode="decimal"
                  value={marginInput}
                  onChange={(e) => setMarginInput(e.target.value)}
                  className={inputClass}
                />
                {(() => {
                  const v = parsePriceInput(marginInput);
                  return v != null && !isValidMarginTargetPct(v) ? (
                    <p className="mt-1 text-[11px] text-[#C4531F]">Margen debe estar entre 0 % y 99,9 %.</p>
                  ) : null;
                })()}
              </div>
            )}
            {mode === 'positioning' && (
              <div className="grid grid-cols-3 gap-1.5">
                {(['economico', 'equilibrado', 'premium'] as PositioningPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={[
                      'flex flex-col items-center rounded-xl px-2 py-2.5 text-center transition ring-1',
                      preset === p
                        ? 'bg-[#4A6B3A] text-white ring-[#4A6B3A]'
                        : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50',
                    ].join(' ')}
                  >
                    <span className="text-[11px] font-bold">{POSITIONING_LABELS[p]}</span>
                    <span className={`mt-0.5 text-[9px] ${preset === p ? 'text-white/80' : 'text-zinc-400'}`}>
                      {POSITIONING_SUBTITLES[p]}
                    </span>
                    <span className={`mt-1 font-mono text-[10px] font-bold tabular-nums ${preset === p ? 'text-white' : 'text-zinc-600'}`}>
                      FC {POSITIONING_FC_TARGETS[p]} %
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Comparativa Actual vs Simulación */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* Actual */}
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200/80">
              <div className="border-b border-zinc-100 bg-zinc-50/60 px-3 py-1.5">
                <SectionLabel>Actual</SectionLabel>
              </div>
              <div className="divide-y divide-zinc-100 px-3">
                <MetricRow label="Coste" value={formatMoneyEur(actual.costPerYieldEur)} />
                <MetricRow label="PVP" value={actual.pvpGrossEur != null ? formatMoneyEur(actual.pvpGrossEur) : '—'} />
                <MetricRow
                  label="FC"
                  value={fmtPct(actual.foodCostPct)}
                  valueClass={fcTextClass(actual.foodCostPct)}
                  barPct={actual.foodCostPct}
                  barColor={fcColor(actual.foodCostPct)}
                />
                <MetricRow
                  label="Margen"
                  value={fmtPct(actual.marginPct)}
                  valueClass={actual.marginPct != null && actual.marginPct >= 65 ? 'text-[#4A6B3A]' : 'text-zinc-700'}
                />
              </div>
            </div>

            {/* Simulación */}
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200/80">
              <div className="border-b border-zinc-100 bg-zinc-50/60 px-3 py-1.5">
                <SectionLabel>Simulación</SectionLabel>
              </div>
              <div className="divide-y divide-zinc-100 px-3">
                <MetricRow label="Coste" value={formatMoneyEur(simulated.costPerYieldEur)} />
                <MetricRow
                  label="PVP"
                  value={simulated.pvpGrossEur != null ? formatMoneyEur(simulated.pvpGrossEur) : '—'}
                  sub={
                    comparison.deltaPvpGrossEur != null
                      ? fmtDelta(comparison.deltaPvpGrossEur, ' €')
                      : null
                  }
                  subClass={deltaTextClass(comparison.deltaPvpGrossEur, true)}
                />
                <MetricRow
                  label="FC"
                  value={fmtPct(simulated.foodCostPct)}
                  valueClass={fcTextClass(simulated.foodCostPct)}
                  sub={comparison.deltaFoodCostPp != null ? fmtDelta(comparison.deltaFoodCostPp, ' pp') : null}
                  subClass={deltaTextClass(comparison.deltaFoodCostPp)}
                  barPct={simulated.foodCostPct}
                  barColor={fcColor(simulated.foodCostPct)}
                />
                <MetricRow
                  label="Margen"
                  value={fmtPct(simulated.marginPct)}
                  valueClass={simulated.marginPct != null && simulated.marginPct >= 65 ? 'text-[#4A6B3A]' : 'text-zinc-700'}
                  sub={comparison.deltaMarginPp != null ? fmtDelta(comparison.deltaMarginPp, ' pp') : null}
                  subClass={deltaTextClass(comparison.deltaMarginPp, true)}
                />
              </div>
            </div>
          </div>

          {/* Warning price_below_cost */}
          {simulated.warnings.some((w) => w.code === 'price_below_cost') && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 ring-1 ring-red-100">
              El PVP está por debajo del coste de producción.
            </p>
          )}
          {/* Warning invalid input */}
          {!simulated.valid && simulated.warnings.filter((w) => w.code !== 'no_cost').length > 0 && mode !== 'pvp_manual' && (
            <p className="mt-2 text-[11px] text-zinc-400">
              {simulated.warnings.find((w) => w.code !== 'no_cost')?.message}
            </p>
          )}

          {/* Objetivo Chef One */}
          <ChefOneBlock comparison={chefOneComparison} />

          {/* Familia */}
          {familyName && familyBenchmark ? (
            <FamilyBlock
              benchmark={familyBenchmark}
              comparison={familyComparison}
              familyName={familyName}
            />
          ) : null}

          {/* Microcopy */}
          <p className="mt-3 text-center text-[10px] text-zinc-400">
            La simulación no modifica la carta hasta guardar.
          </p>

          {/* CTA */}
          {readonly ? (
            onEditRecipe ? (
              <button
                type="button"
                onClick={onEditRecipe}
                className="mt-2 flex w-full items-center justify-center rounded-xl bg-zinc-100 py-2.5 text-[12px] font-bold text-zinc-700 transition hover:bg-zinc-200"
              >
                Editar receta
              </button>
            ) : null
          ) : demoReadonly ? (
            <button
              type="button"
              disabled
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-zinc-100 py-2.5 text-[12px] font-bold text-zinc-400 opacity-50"
            >
              Aplicar PVP recomendado
            </button>
          ) : canApply ? (
            <button
              type="button"
              onClick={() => onApplyRecommendedPvp?.(simulated.pvpGrossEur!)}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#4A6B3A] py-2.5 text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(74,107,58,0.22)] transition hover:bg-[#3d5a30] active:scale-[0.99]"
            >
              Aplicar PVP recomendado ·{' '}
              {simulated.pvpGrossEur != null ? formatMoneyEur(simulated.pvpGrossEur) : '—'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
