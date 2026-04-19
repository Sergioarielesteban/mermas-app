'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  formatMinutesHuman,
  plannedShiftMinutes,
  sortEntriesByTime,
  workedMinutesForDay,
} from '@/lib/staff/attendance-logic';
import { hintForEmployeeDay } from '@/lib/staff/staff-heuristics';
import {
  fetchShiftsRange,
  fetchStaffEmployees,
  fetchTimeAdjustmentsRange,
  fetchTimeEntriesRange,
  staffDisplayName,
  upsertTimeAdjustment,
} from '@/lib/staff/staff-supabase';
import { addDays, ymdLocal } from '@/lib/staff/staff-dates';
import { getSupabaseClient } from '@/lib/supabase-client';
import type {
  StaffEmployee,
  StaffShift,
  StaffTimeAdjustment,
  StaffTimeEntry,
} from '@/lib/staff/types';

const HINT_LABEL: Record<string, string> = {
  late: 'Retraso',
  no_clock_in: 'Sin entrada',
  incomplete: 'Jornada abierta',
  early_out: 'Salida temprana',
  ok: 'OK',
  none: '—',
};

const ADJUSTMENT_REASON_OPTIONS = [
  'olvidó fichar entrada',
  'olvidó fichar salida',
  'error de fichaje',
  'corrección autorizada',
  'otro',
] as const;

type RegistroView = 'planning' | 'real' | 'adjusted';

type RealRow = {
  employee: StaffEmployee;
  day: string;
  plannedText: string;
  firstIn: string | null;
  lastOut: string | null;
  worked: number;
  deltaMinutes: number | null;
  hint: string;
  adjustment: StaffTimeAdjustment | null;
};

function toLocalDateInput(d: Date): string {
  return ymdLocal(d);
}

function fmtDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtTimeIso(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTimeIso(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromDatetimeLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function PersonalRegistroPage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [fromDate, setFromDate] = useState(() => toLocalDateInput(addDays(new Date(), -30)));
  const [toDate, setToDate] = useState(() => toLocalDateInput(new Date()));
  const [view, setView] = useState<RegistroView>('real');
  const [empFilter, setEmpFilter] = useState('');
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [entries, setEntries] = useState<StaffTimeEntry[]>([]);
  const [adjustments, setAdjustments] = useState<StaffTimeAdjustment[]>([]);
  const [adjusterLabels, setAdjusterLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<RealRow | null>(null);
  const [adjustedInInput, setAdjustedInInput] = useState('');
  const [adjustedOutInput, setAdjustedOutInput] = useState('');
  const [reasonOption, setReasonOption] = useState<(typeof ADJUSTMENT_REASON_OPTIONS)[number]>(
    'error de fichaje',
  );
  const [reasonOther, setReasonOther] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const load = useCallback(async () => {
    if (!localId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59.999`);
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const [em, sh, te, adj] = await Promise.all([
        fetchStaffEmployees(supabase, localId),
        fetchShiftsRange(supabase, localId, fromDate, toDate),
        fetchTimeEntriesRange(supabase, localId, start.toISOString(), end.toISOString()),
        fetchTimeAdjustmentsRange(supabase, localId, fromDate, toDate),
      ]);
      setEmployees(em.filter((e) => e.active));
      setShifts(sh);
      setEntries(te);
      setAdjustments(adj);

      const adjusterIds = [...new Set(adj.map((a) => a.adjustedByUserId).filter((x): x is string => Boolean(x)))];
      if (adjusterIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_id,full_name,login_username,email')
          .eq('local_id', localId)
          .in('user_id', adjusterIds);
        if (error) throw new Error(error.message);
        const labelMap: Record<string, string> = {};
        for (const row of data ?? []) {
          const item = row as {
            user_id?: string | null;
            full_name?: string | null;
            login_username?: string | null;
            email?: string | null;
          };
          if (!item.user_id) continue;
          labelMap[item.user_id] =
            item.full_name?.trim() ||
            item.login_username?.trim() ||
            item.email?.trim() ||
            item.user_id.slice(0, 8);
        }
        setAdjusterLabels(labelMap);
      } else {
        setAdjusterLabels({});
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [localId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEmployees = useMemo(() => {
    const linked = employees.find((e) => e.userId === userId);
    let list = employees;
    if (!perms.canViewTeamSummary && linked) list = [linked];
    if (empFilter.trim()) {
      const q = empFilter.trim().toLowerCase();
      list = list.filter((e) => staffDisplayName(e).toLowerCase().includes(q));
    }
    return list;
  }, [employees, empFilter, perms.canViewTeamSummary, userId]);

  const employeeById = useMemo(() => {
    const map = new Map<string, StaffEmployee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const visibleEmployeeIds = useMemo(() => new Set(visibleEmployees.map((e) => e.id)), [visibleEmployees]);

  const adjustmentByEmployeeDay = useMemo(() => {
    const map = new Map<string, StaffTimeAdjustment>();
    for (const a of adjustments) {
      map.set(`${a.employeeId}|${a.workDate}`, a);
    }
    return map;
  }, [adjustments]);

  const planningRows = useMemo(() => {
    return shifts
      .filter((s) => visibleEmployeeIds.has(s.employeeId))
      .map((s) => ({
        employee: employeeById.get(s.employeeId),
        day: s.shiftDate,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
        zone: s.zone ?? '—',
      }))
      .filter((r): r is { employee: StaffEmployee; day: string; startTime: string; endTime: string; zone: string } =>
        Boolean(r.employee),
      )
      .sort((a, b) => `${a.day}|${a.employee.firstName}`.localeCompare(`${b.day}|${b.employee.firstName}`));
  }, [shifts, visibleEmployeeIds, employeeById]);

  const realRows = useMemo<RealRow[]>(() => {
    const keys = new Set<string>();
    for (const e of entries) {
      if (!visibleEmployeeIds.has(e.employeeId)) continue;
      const ymd = ymdLocal(new Date(e.occurredAt));
      keys.add(`${e.employeeId}|${ymd}`);
    }
    const out: RealRow[] = [];
    for (const key of keys) {
      const [employeeId, day] = key.split('|');
      const employee = employeeById.get(employeeId);
      if (!employee) continue;
      const dayEntries = sortEntriesByTime(
        entries.filter((x) => x.employeeId === employeeId && ymdLocal(new Date(x.occurredAt)) === day),
      );
      const planned = shifts
        .filter((s) => s.employeeId === employeeId && s.shiftDate === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
      const worked = workedMinutesForDay(dayEntries);
      const plannedM = planned ? plannedShiftMinutes(planned) : 0;
      const hint = hintForEmployeeDay(shifts, entries, employeeId, day);
      const firstIn = dayEntries.find((x) => x.eventType === 'clock_in');
      const lastOut = [...dayEntries].reverse().find((x) => x.eventType === 'clock_out');
      out.push({
        employee,
        day,
        plannedText: planned ? `${planned.startTime.slice(0, 5)}–${planned.endTime.slice(0, 5)}` : '—',
        firstIn: firstIn?.occurredAt ?? null,
        lastOut: lastOut?.occurredAt ?? null,
        worked,
        deltaMinutes: plannedM ? worked - plannedM : null,
        hint: hint.hint,
        adjustment: adjustmentByEmployeeDay.get(key) ?? null,
      });
    }
    return out.sort((a, b) => `${a.day}|${staffDisplayName(a.employee)}`.localeCompare(`${b.day}|${staffDisplayName(b.employee)}`));
  }, [entries, visibleEmployeeIds, employeeById, shifts, adjustmentByEmployeeDay]);

  const adjustedRows = useMemo(() => {
    return adjustments
      .filter((a) => visibleEmployeeIds.has(a.employeeId) && a.isAdjusted)
      .map((a) => ({
        adjustment: a,
        employee: employeeById.get(a.employeeId),
      }))
      .filter((x): x is { adjustment: StaffTimeAdjustment; employee: StaffEmployee } => Boolean(x.employee))
      .sort((a, b) =>
        `${a.adjustment.workDate}|${staffDisplayName(a.employee)}`.localeCompare(
          `${b.adjustment.workDate}|${staffDisplayName(b.employee)}`,
        ),
      );
  }, [adjustments, visibleEmployeeIds, employeeById]);

  const currentRowsCount = view === 'planning' ? planningRows.length : view === 'real' ? realRows.length : adjustedRows.length;

  const openAdjustModal = (row: RealRow) => {
    setAdjustTarget(row);
    setAdjustedInInput(toDatetimeLocalInput(row.adjustment?.clockInAdjusted ?? row.firstIn));
    setAdjustedOutInput(toDatetimeLocalInput(row.adjustment?.clockOutAdjusted ?? row.lastOut));
    const existingReason = row.adjustment?.adjustmentReason?.trim() ?? '';
    const matchesPreset = ADJUSTMENT_REASON_OPTIONS.find((opt) => opt !== 'otro' && existingReason === opt);
    if (matchesPreset) {
      setReasonOption(matchesPreset);
      setReasonOther('');
    } else if (existingReason) {
      setReasonOption('otro');
      setReasonOther(existingReason);
    } else {
      setReasonOption('error de fichaje');
      setReasonOther('');
    }
    setAdjustModalOpen(true);
  };

  const closeAdjustModal = () => {
    setAdjustModalOpen(false);
    setAdjustTarget(null);
    setAdjustedInInput('');
    setAdjustedOutInput('');
    setReasonOption('error de fichaje');
    setReasonOther('');
    setSavingAdjustment(false);
  };

  const saveAdjustment = async () => {
    if (!adjustTarget || !localId || !userId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const reason =
      reasonOption === 'otro' ? reasonOther.trim() : reasonOption;
    if (!reason) {
      setErr('El motivo del ajuste es obligatorio');
      return;
    }
    const clockInAdjusted = fromDatetimeLocalInput(adjustedInInput);
    const clockOutAdjusted = fromDatetimeLocalInput(adjustedOutInput);
    if (!clockInAdjusted && !clockOutAdjusted) {
      setErr('Indica al menos una hora ajustada (entrada o salida)');
      return;
    }
    setSavingAdjustment(true);
    setErr(null);
    try {
      await upsertTimeAdjustment(supabase, {
        localId,
        employeeId: adjustTarget.employee.id,
        workDate: adjustTarget.day,
        clockInOriginal: adjustTarget.adjustment?.clockInOriginal ?? adjustTarget.firstIn,
        clockOutOriginal: adjustTarget.adjustment?.clockOutOriginal ?? adjustTarget.lastOut,
        clockInAdjusted,
        clockOutAdjusted,
        adjustmentReason: reason,
        adjustedByUserId: userId,
      });
      closeAdjustModal();
      setOkMsg('Registro ajustado y auditado correctamente');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'No se pudo ajustar el registro');
    } finally {
      setSavingAdjustment(false);
    }
  };

  const exportExcel = async (targetView: RegistroView) => {
    if (!perms.canCorrectEntries) return;
    const XLSX = await import('xlsx');
    const rows =
      targetView === 'planning'
        ? planningRows.map((r) => ({
            Fecha: fmtDate(r.day),
            Empleado: staffDisplayName(r.employee),
            Entrada_prevista: r.startTime,
            Salida_prevista: r.endTime,
            Turno_Puesto: r.zone,
          }))
        : targetView === 'real'
          ? realRows.map((r) => ({
              Fecha: fmtDate(r.day),
              Empleado: staffDisplayName(r.employee),
              Entrada_original: fmtTimeIso(r.firstIn),
              Salida_original: fmtTimeIso(r.lastOut),
              Horas_reales: formatMinutesHuman(r.worked),
              Estado: HINT_LABEL[r.hint] ?? r.hint,
            }))
          : adjustedRows.map(({ adjustment, employee }) => ({
              Fecha: fmtDate(adjustment.workDate),
              Empleado: staffDisplayName(employee),
              Entrada_original: fmtDateTimeIso(adjustment.clockInOriginal),
              Salida_original: fmtDateTimeIso(adjustment.clockOutOriginal),
              Entrada_ajustada: fmtDateTimeIso(adjustment.clockInAdjusted),
              Salida_ajustada: fmtDateTimeIso(adjustment.clockOutAdjusted),
              Motivo: adjustment.adjustmentReason ?? '—',
              Ajustado_por:
                (adjustment.adjustedByUserId && adjusterLabels[adjustment.adjustedByUserId]) ||
                adjustment.adjustedByUserId ||
                '—',
              Fecha_ajuste: fmtDateTimeIso(adjustment.adjustedAt),
            }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Sin datos para exportar en este rango' }]);
    XLSX.utils.book_append_sheet(wb, ws, targetView === 'planning' ? 'Planificacion' : targetView === 'real' ? 'RegistroReal' : 'RegistroAjustado');
    XLSX.writeFile(wb, `horarios-${targetView}-${fromDate}-${toDate}.xlsx`);
  };

  const exportPdf = async (targetView: RegistroView) => {
    if (!perms.canCorrectEntries) return;
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const title =
      targetView === 'planning'
        ? 'Informe de planificacion'
        : targetView === 'real'
          ? 'Informe de registro real'
          : 'Informe de registro ajustado';
    doc.setFontSize(14);
    doc.text(title, 40, 36);
    doc.setFontSize(10);
    doc.text(`Periodo: ${fmtDate(fromDate)} - ${fmtDate(toDate)}`, 40, 54);

    const head =
      targetView === 'planning'
        ? [['Fecha', 'Empleado', 'Entrada prevista', 'Salida prevista', 'Turno / Puesto']]
        : targetView === 'real'
          ? [['Fecha', 'Empleado', 'Entrada original', 'Salida original', 'Horas reales', 'Estado']]
          : [['Fecha', 'Empleado', 'Entrada orig.', 'Salida orig.', 'Entrada aj.', 'Salida aj.', 'Motivo', 'Ajustado por', 'Fecha ajuste']];

    const body =
      targetView === 'planning'
        ? planningRows.map((r) => [
            fmtDate(r.day),
            staffDisplayName(r.employee),
            r.startTime,
            r.endTime,
            r.zone,
          ])
        : targetView === 'real'
          ? realRows.map((r) => [
              fmtDate(r.day),
              staffDisplayName(r.employee),
              fmtTimeIso(r.firstIn),
              fmtTimeIso(r.lastOut),
              formatMinutesHuman(r.worked),
              HINT_LABEL[r.hint] ?? r.hint,
            ])
          : adjustedRows.map(({ adjustment, employee }) => [
              fmtDate(adjustment.workDate),
              staffDisplayName(employee),
              fmtDateTimeIso(adjustment.clockInOriginal),
              fmtDateTimeIso(adjustment.clockOutOriginal),
              fmtDateTimeIso(adjustment.clockInAdjusted),
              fmtDateTimeIso(adjustment.clockOutAdjusted),
              adjustment.adjustmentReason ?? '—',
              (adjustment.adjustedByUserId && adjusterLabels[adjustment.adjustedByUserId]) ||
                adjustment.adjustedByUserId ||
                '—',
              fmtDateTimeIso(adjustment.adjustedAt),
            ]);

    autoTable(doc, {
      startY: 70,
      head,
      body: body.length ? body : [['Sin datos']],
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [211, 47, 47] },
    });
    doc.save(`horarios-${targetView}-${fromDate}-${toDate}.pdf`);
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) return <p className="text-sm text-amber-800">Sin local.</p>;

  return (
    <div className="space-y-4">
      <MermasStyleHero eyebrow="Control horario" title="Registro diario" compact />

      <div className="grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-zinc-200 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-bold text-zinc-600">
          Desde
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold text-zinc-600">
          Hasta
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold text-zinc-600">
          Vista / informe
          <select
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold"
            value={view}
            onChange={(e) => setView(e.target.value as RegistroView)}
          >
            <option value="planning">Planificación</option>
            <option value="real">Registro real</option>
            <option value="adjusted">Registro ajustado</option>
          </select>
        </label>
        <label className="text-xs font-bold text-zinc-600 lg:col-span-2">
          Empleado
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="Filtrar por nombre…"
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
          />
        </label>
      </div>

      {perms.canCorrectEntries ? (
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
            Exportación de informes
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <p className="text-sm font-extrabold text-zinc-800">Planificación</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void exportExcel('planning')} className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white">Excel</button>
                <button type="button" onClick={() => void exportPdf('planning')} className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800">PDF</button>
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <p className="text-sm font-extrabold text-zinc-800">Registro real</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void exportExcel('real')} className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white">Excel</button>
                <button type="button" onClick={() => void exportPdf('real')} className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800">PDF</button>
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
              <p className="text-sm font-extrabold text-zinc-800">Registro ajustado</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void exportExcel('adjusted')} className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white">Excel</button>
                <button type="button" onClick={() => void exportPdf('adjusted')} className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800">PDF</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200">
          Tu rol no puede ajustar fichajes ni exportar informes sensibles.
        </p>
      )}

      {err ? <p className="text-sm font-semibold text-red-700">{err}</p> : null}
      {okMsg ? <p className="text-sm font-semibold text-emerald-700">{okMsg}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
        Mostrando {currentRowsCount} filas · periodo {fmtDate(fromDate)} - {fmtDate(toDate)}
      </div>

      <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200">
        {view === 'planning' ? (
          <table className="min-w-[760px] w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-[10px] font-extrabold uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2 sm:px-3">Persona</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Entrada prevista</th>
                <th className="px-2 py-2">Salida prevista</th>
                <th className="px-2 py-2">Turno / puesto</th>
              </tr>
            </thead>
            <tbody>
              {planningRows.map((r) => (
                <tr key={`${r.employee.id}-${r.day}-${r.startTime}`} className="border-t border-zinc-100">
                  <td className="px-2 py-2 font-bold text-zinc-900 sm:px-3">{staffDisplayName(r.employee)}</td>
                  <td className="px-2 py-2">{fmtDate(r.day)}</td>
                  <td className="px-2 py-2">{r.startTime}</td>
                  <td className="px-2 py-2">{r.endTime}</td>
                  <td className="px-2 py-2">{r.zone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {view === 'real' ? (
          <table className="min-w-[980px] w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-[10px] font-extrabold uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2 sm:px-3">Persona</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Entrada original</th>
                <th className="px-2 py-2">Salida original</th>
                <th className="px-2 py-2">Trabajado</th>
                <th className="px-2 py-2">Δ</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Ajuste</th>
                {perms.canCorrectEntries ? <th className="px-2 py-2">Acción</th> : null}
              </tr>
            </thead>
            <tbody>
              {realRows.map((r) => (
                <tr key={`${r.employee.id}-${r.day}`} className="border-t border-zinc-100 align-top">
                  <td className="px-2 py-2 font-bold text-zinc-900 sm:px-3">{staffDisplayName(r.employee)}</td>
                  <td className="px-2 py-2">{fmtDate(r.day)}</td>
                  <td className="px-2 py-2 text-zinc-600">{r.plannedText}</td>
                  <td className="px-2 py-2">{fmtTimeIso(r.firstIn)}</td>
                  <td className="px-2 py-2">{fmtTimeIso(r.lastOut)}</td>
                  <td className="px-2 py-2 font-semibold">{formatMinutesHuman(r.worked)}</td>
                  <td
                    className={[
                      'px-2 py-2 font-bold',
                      r.deltaMinutes == null
                        ? 'text-zinc-500'
                        : r.deltaMinutes > 10
                          ? 'text-emerald-700'
                          : r.deltaMinutes < -10
                            ? 'text-red-700'
                            : 'text-zinc-600',
                    ].join(' ')}
                  >
                    {r.deltaMinutes == null ? '—' : `${r.deltaMinutes >= 0 ? '+' : ''}${r.deltaMinutes} min`}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                        r.hint === 'ok' || r.hint === 'none' ? 'bg-zinc-100 text-zinc-700' : 'bg-amber-100 text-amber-900',
                      ].join(' ')}
                    >
                      {HINT_LABEL[r.hint] ?? r.hint}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {r.adjustment?.isAdjusted ? (
                      <div className="space-y-1">
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-900">
                          Ajustado
                        </span>
                        <p className="text-[11px] text-zinc-700">
                          Orig: {fmtTimeIso(r.adjustment.clockInOriginal)} - {fmtTimeIso(r.adjustment.clockOutOriginal)}
                        </p>
                        <p className="text-[11px] font-semibold text-zinc-800">
                          Ajus: {fmtTimeIso(r.adjustment.clockInAdjusted)} - {fmtTimeIso(r.adjustment.clockOutAdjusted)}
                        </p>
                        <p className="text-[11px] text-zinc-600">{r.adjustment.adjustmentReason}</p>
                        <p className="text-[10px] text-zinc-500">
                          {r.adjustment.adjustedByUserId ? adjusterLabels[r.adjustment.adjustedByUserId] ?? r.adjustment.adjustedByUserId : '—'} · {fmtDateTimeIso(r.adjustment.adjustedAt)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  {perms.canCorrectEntries ? (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => openAdjustModal(r)}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-zinc-800"
                      >
                        Ajustar registro
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {view === 'adjusted' ? (
          <table className="min-w-[1120px] w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-[10px] font-extrabold uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2 sm:px-3">Persona</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Entrada original</th>
                <th className="px-2 py-2">Salida original</th>
                <th className="px-2 py-2">Entrada ajustada</th>
                <th className="px-2 py-2">Salida ajustada</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2">Ajustado por</th>
                <th className="px-2 py-2">Fecha ajuste</th>
              </tr>
            </thead>
            <tbody>
              {adjustedRows.map(({ adjustment, employee }) => (
                <tr key={adjustment.id} className="border-t border-zinc-100">
                  <td className="px-2 py-2 font-bold text-zinc-900 sm:px-3">
                    <span className="mr-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-900">
                      Ajustado
                    </span>
                    {staffDisplayName(employee)}
                  </td>
                  <td className="px-2 py-2">{fmtDate(adjustment.workDate)}</td>
                  <td className="px-2 py-2">{fmtDateTimeIso(adjustment.clockInOriginal)}</td>
                  <td className="px-2 py-2">{fmtDateTimeIso(adjustment.clockOutOriginal)}</td>
                  <td className="px-2 py-2 font-semibold text-zinc-900">{fmtDateTimeIso(adjustment.clockInAdjusted)}</td>
                  <td className="px-2 py-2 font-semibold text-zinc-900">{fmtDateTimeIso(adjustment.clockOutAdjusted)}</td>
                  <td className="px-2 py-2">{adjustment.adjustmentReason ?? '—'}</td>
                  <td className="px-2 py-2">
                    {adjustment.adjustedByUserId
                      ? adjusterLabels[adjustment.adjustedByUserId] ?? adjustment.adjustedByUserId
                      : '—'}
                  </td>
                  <td className="px-2 py-2">{fmtDateTimeIso(adjustment.adjustedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {adjustModalOpen && adjustTarget ? (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-[80] bg-black/40"
            onClick={closeAdjustModal}
          />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
            <p className="text-lg font-extrabold text-zinc-900">Ajustar registro</p>
            <p className="mt-1 text-sm text-zinc-600">
              {staffDisplayName(adjustTarget.employee)} · {fmtDate(adjustTarget.day)}
            </p>
            <div className="mt-3 grid gap-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
              <p className="text-xs font-semibold text-zinc-700">
                Original: {fmtTimeIso(adjustTarget.adjustment?.clockInOriginal ?? adjustTarget.firstIn)} - {fmtTimeIso(adjustTarget.adjustment?.clockOutOriginal ?? adjustTarget.lastOut)}
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-zinc-600">
                Entrada ajustada
                <input
                  type="datetime-local"
                  value={adjustedInInput}
                  onChange={(e) => setAdjustedInInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-zinc-600">
                Salida ajustada
                <input
                  type="datetime-local"
                  value={adjustedOutInput}
                  onChange={(e) => setAdjustedOutInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-bold text-zinc-600">
              Motivo del ajuste (obligatorio)
              <select
                value={reasonOption}
                onChange={(e) => setReasonOption(e.target.value as (typeof ADJUSTMENT_REASON_OPTIONS)[number])}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {ADJUSTMENT_REASON_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            {reasonOption === 'otro' ? (
              <label className="mt-2 block text-xs font-bold text-zinc-600">
                Especifica el motivo
                <textarea
                  value={reasonOther}
                  onChange={(e) => setReasonOther(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeAdjustModal}
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingAdjustment}
                onClick={() => void saveAdjustment()}
                className="flex-1 rounded-xl bg-[#D32F2F] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {savingAdjustment ? 'Guardando…' : 'Guardar ajuste'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
