'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import ShiftEditorModal, { type ShiftDraft } from '@/components/staff/ShiftEditorModal';
import ShiftWeekGrid from '@/components/staff/ShiftWeekGrid';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { addDays, parseYmd, startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import { duplicateShiftsWeek, upsertStaffShift } from '@/lib/staff/staff-supabase';
import type { StaffShift } from '@/lib/staff/types';
import { getSupabaseClient } from '@/lib/supabase-client';

export default function PersonalPlanificacionPage() {
  const { localId, profileRole, profileReady } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [weekStart, setWeekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const weekStartDate = useMemo(() => parseYmd(weekStart), [weekStart]);
  const { employees, shifts, loading, error, reload } = useStaffBundle(localId, weekStart);
  const [view, setView] = useState<'semana' | 'dia' | 'mes'>('semana');
  const [dayFocus, setDayFocus] = useState(() => ymdLocal(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const onRt = useCallback(() => void reload(), [reload]);
  useStaffRealtime(localId, onRt);

  const supabase = getSupabaseClient();

  const shiftsInMonth = useMemo(() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const from = ymdLocal(new Date(y, m, 1));
    const to = ymdLocal(new Date(y, m + 1, 0));
    return shifts.filter((s) => s.shiftDate >= from && s.shiftDate <= to);
  }, [shifts, monthCursor]);

  const dayShifts = useMemo(() => shifts.filter((s) => s.shiftDate === dayFocus), [shifts, dayFocus]);

  const openNew = (employeeId: string, dateYmd: string) => {
    if (!perms.canManageSchedules) return;
    setDraft({ mode: 'new', employeeId, shiftDate: dateYmd });
    setModalOpen(true);
  };

  const openEdit = (s: StaffShift) => {
    if (!perms.canManageSchedules) return;
    setDraft({ mode: 'edit', shift: s });
    setModalOpen(true);
  };

  const onShiftMoved = async (shift: StaffShift, newEmployeeId: string, newDateYmd: string) => {
    if (!perms.canManageSchedules || !localId || !supabase) return;
    try {
      await upsertStaffShift(supabase, {
        id: shift.id,
        localId,
        employeeId: newEmployeeId,
        shiftDate: newDateYmd,
        startTime: shift.startTime,
        endTime: shift.endTime,
        endsNextDay: shift.endsNextDay,
        breakMinutes: shift.breakMinutes,
        zone: shift.zone,
        notes: shift.notes,
        status: shift.status,
        colorHint: shift.colorHint,
      });
      void reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'No se pudo mover el turno');
    }
  };

  const duplicateNextWeek = async () => {
    if (!perms.canManageSchedules || !localId || !supabase) return;
    const next = addDays(weekStartDate, 7);
    const toYmd = ymdLocal(next);
    if (!window.confirm(`¿Duplicar toda la semana al ${toYmd}?`)) return;
    try {
      const n = await duplicateShiftsWeek(supabase, localId, weekStart, toYmd);
      alert(`Copiados ${n} turnos.`);
      void reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al duplicar');
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) {
    return <p className="text-sm text-amber-800">Sin local asignado.</p>;
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Cuadrante"
        title="Planificación"
        tagline="Vista semanal con colores por puesto, totales y arrastre de turnos (encargados)."
        compact
      />

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(['semana', 'dia', 'mes'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={[
              'rounded-full px-4 py-2 text-xs font-extrabold capitalize',
              view === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'semana' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 p-2"
                onClick={() => setWeekStart((w) => ymdLocal(addDays(parseYmd(w), -7)))}
                aria-label="Semana anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm font-bold text-zinc-800">
                Semana del {weekStart}
              </span>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 p-2"
                onClick={() => setWeekStart((w) => ymdLocal(addDays(parseYmd(w), 7)))}
                aria-label="Semana siguiente"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            {perms.canManageSchedules ? (
              <button
                type="button"
                onClick={() => void duplicateNextWeek()}
                className="flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-xs font-extrabold text-white"
              >
                <Copy className="h-4 w-4" />
                Duplicar semana →
              </button>
            ) : null}
          </div>
          {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
          {!perms.canManageSchedules ? (
            <p className="text-sm text-zinc-600">Solo lectura: pide a un encargado los cambios de cuadrante.</p>
          ) : null}
          <ShiftWeekGrid
            weekStartMonday={weekStartDate}
            employees={employees}
            shifts={shifts}
            canDragShifts={perms.canManageSchedules}
            onShiftMoved={onShiftMoved}
            onCellActivate={(empId, ymd, here) => {
              if (here.length === 1) openEdit(here[0]);
              else if (here.length === 0) openNew(empId, ymd);
              else {
                const pick = window.prompt(
                  `Varios turnos. Escribe 1–${here.length} para editar o 0 para nuevo`,
                  '1',
                );
                const n = Number(pick);
                if (n === 0) openNew(empId, ymd);
                else if (n >= 1 && n <= here.length) openEdit(here[n - 1]);
              }
            }}
          />
        </>
      ) : null}

      {view === 'dia' ? (
        <div className="space-y-3">
          <input
            type="date"
            className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm font-bold"
            value={dayFocus}
            onChange={(e) => setDayFocus(e.target.value)}
          />
          <ul className="space-y-2">
            {dayShifts.length === 0 ? (
              <li className="text-sm text-zinc-500">Sin turnos este día.</li>
            ) : (
              dayShifts.map((s) => {
                const em = employees.find((e) => e.id === s.employeeId);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!perms.canManageSchedules}
                      onClick={() => openEdit(s)}
                      className="w-full rounded-2xl bg-zinc-50 px-4 py-3 text-left text-sm font-bold ring-1 ring-zinc-200 disabled:opacity-60"
                    >
                      {em ? `${em.firstName} ${em.lastName}` : s.employeeId} · {s.startTime.slice(0, 5)} –{' '}
                      {s.endTime.slice(0, 5)}
                      {s.zone ? ` · ${s.zone}` : ''}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}

      {view === 'mes' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 p-2"
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-extrabold capitalize text-zinc-900">
              {monthCursor.toLocaleDateString('es', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 p-2"
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <MonthMiniCalendar
            cursor={monthCursor}
            shifts={shiftsInMonth}
            onPickDay={(ymd) => {
              setDayFocus(ymd);
              setView('dia');
            }}
          />
        </div>
      ) : null}

      {supabase && draft && modalOpen ? (
        <ShiftEditorModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          supabase={supabase}
          localId={localId}
          employees={employees}
          draft={draft}
          onSaved={() => void reload()}
          canDelete={perms.canManageSchedules}
        />
      ) : null}
    </div>
  );
}

function MonthMiniCalendar({
  cursor,
  shifts,
  onPickDay,
}: {
  cursor: Date;
  shifts: StaffShift[];
  onPickDay: (ymd: string) => void;
}) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const startPad = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startPad).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const countByDay = new Map<string, number>();
  for (const s of shifts) {
    countByDay.set(s.shiftDate, (countByDay.get(s.shiftDate) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-500 sm:text-xs">
      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
        <div key={d} className="py-1">
          {d}
        </div>
      ))}
      {cells.map((d, i) => {
        if (d == null) return <div key={`e-${i}`} />;
        const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const c = countByDay.get(ymd) ?? 0;
        return (
          <button
            key={ymd}
            type="button"
            onClick={() => onPickDay(ymd)}
            className="rounded-xl bg-zinc-50 py-2 ring-1 ring-zinc-100 hover:bg-[#D32F2F]/10"
          >
            <span className="block text-sm font-extrabold text-zinc-900">{d}</span>
            {c > 0 ? <span className="text-[10px] text-[#D32F2F]">{c} turnos</span> : <span className="text-[10px] text-zinc-400">—</span>}
          </button>
        );
      })}
    </div>
  );
}
