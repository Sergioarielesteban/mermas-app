'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import ShiftEditorModal, { PLANIFICACION_MODAL_ABORT, type ShiftDraft } from '@/components/staff/ShiftEditorModal';
import { PersonalSectionNav } from '@/components/staff/StaffPersonalShell';
import OperationalWeekGrid, { OPERATIONAL_NONE_ZONE } from '@/components/staff/OperationalWeekGrid';
import ShiftWeekGrid, { SHIFT_GRID_UNASSIGNED_ROW_ID } from '@/components/staff/ShiftWeekGrid';
import { useStaffBundle } from '@/hooks/useStaffBundle';
import { useStaffRealtime } from '@/hooks/useStaffRealtime';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { addDays, parseYmd, startOfWeekMonday, ymdLocal } from '@/lib/staff/staff-dates';
import {
  readLastEmployeeForZone,
  resolveQuickPresetForZone,
  writeStoredPresetIdForZone,
} from '@/lib/staff/shift-quick-presets';
import {
  readCustomOperationalZones,
  slugifyOperationalZoneKey,
  writeCustomOperationalZones,
  type CustomOperationalZoneRow,
} from '@/lib/staff/operational-custom-zones';
import { zoneDefaultColorHint } from '@/lib/staff/staff-zone-styles';
import {
  DEFAULT_LOCAL_OPERATIONAL_WINDOW,
  operationalWindowFromLocalsRow,
} from '@/lib/staff/local-operational-window';
import {
  deleteStaffScheduleDayMark,
  deleteStaffScheduleDayMarkForCell,
  deleteStaffShift,
  duplicateShiftsWeek,
  upsertStaffScheduleDayMark,
  upsertStaffShift,
} from '@/lib/staff/staff-supabase';
import type { StaffEmployee, StaffScheduleDayMark, StaffShift, StaffScheduleDayMarkKind } from '@/lib/staff/types';
import {
  collectUserIdsWithShiftsInWeek,
  fetchStaffWeekPublication,
  markStaffWeekDirtyIfPublished,
  upsertPublishStaffWeek,
  type StaffWeekPublication,
} from '@/lib/staff/staff-week-publication';
import { appAlert, appConfirm, appPrompt } from '@/lib/app-dialog-bridge';
import { getSupabaseClient } from '@/lib/supabase-client';
import { notifyStaffWeekSchedulePublished } from '@/services/notifications';

export default function PersonalPlanificacionPage() {
  const { localId, profileRole, profileReady, userId } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const [weekStart, setWeekStart] = useState(() => ymdLocal(startOfWeekMonday(new Date())));
  const weekStartDate = useMemo(() => parseYmd(weekStart), [weekStart]);
  const weekEndYmd = useMemo(() => ymdLocal(addDays(weekStartDate, 6)), [weekStartDate]);
  /** Única fuente de turnos de la semana para cuadrante por puesto y por empleado (misma query / mismo estado). */
  const { employees, shifts, scheduleDayMarks, loading, error, reload } = useStaffBundle(localId, weekStart);

  /**
   * Empleados activos más filas sintéticas para turnos cuya `employeeId` no está en la lista activa
   * (p. ej. dado de baja): sin esto, esos turnos solo se ven en vista operativa y parece “desincronizado”.
   */
  const employeesForShiftWeekGrid = useMemo(() => {
    const inWeek = (d: string) => d >= weekStart && d <= weekEndYmd;
    const byId = new Map(employees.map((e) => [e.id, e] as const));
    const missing = new Set<string>();
    for (const s of shifts) {
      if (s.employeeId == null || !inWeek(s.shiftDate)) continue;
      if (!byId.has(s.employeeId)) missing.add(s.employeeId);
    }
    if (missing.size === 0) return employees;
    const lid = localId ?? '';
    const synth: StaffEmployee[] = [...missing].map((id) => ({
      id,
      localId: lid,
      userId: null,
      firstName: 'Empleado',
      lastName: 'no listado',
      alias: `ID ${id.slice(0, 8)}…`,
      phone: null,
      email: null,
      operationalRole: 'Sin ficha activa en equipo',
      weeklyHoursTarget: null,
      workdayType: null,
      color: '#71717a',
      hasPin: false,
      active: false,
      createdAt: '',
      updatedAt: '',
    }));
    return [...employees, ...synth];
  }, [employees, shifts, weekStart, weekEndYmd, localId]);
  const [view, setView] = useState<'semana' | 'dia' | 'mes'>('semana');
  const [weekLayout, setWeekLayout] = useState<'empleados' | 'operativo'>('operativo');
  const [dayFocus, setDayFocus] = useState(() => ymdLocal(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const draftRef = useRef<ShiftDraft | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [operationalWindow, setOperationalWindow] = useState(DEFAULT_LOCAL_OPERATIONAL_WINDOW);
  const [customOperationalZones, setCustomOperationalZones] = useState<CustomOperationalZoneRow[]>([]);
  const [weekPublication, setWeekPublication] = useState<StaffWeekPublication | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);

  const supabase = getSupabaseClient();

  const refetchWeekPublication = useCallback(async () => {
    if (!localId || !supabase) {
      setWeekPublication(null);
      return;
    }
    try {
      const p = await fetchStaffWeekPublication(supabase, localId, weekStart);
      setWeekPublication(p);
    } catch {
      setWeekPublication(null);
    }
  }, [localId, supabase, weekStart]);

  useEffect(() => {
    void refetchWeekPublication();
  }, [refetchWeekPublication]);

  const afterScheduleChange = useCallback(async () => {
    await reload({ silent: true });
    if (!localId || !supabase || !perms.canManageSchedules) return;
    try {
      await markStaffWeekDirtyIfPublished(supabase, localId, weekStart);
      await refetchWeekPublication();
    } catch {
      /* ignore */
    }
  }, [reload, localId, supabase, perms.canManageSchedules, weekStart, refetchWeekPublication]);

  const handleShiftModalSaved = useCallback(async () => {
    const d = draftRef.current;
    if (supabase && localId && d) {
      const emId = d.mode === 'edit' ? d.shift.employeeId : d.employeeId;
      const dt = d.mode === 'edit' ? d.shift.shiftDate : d.shiftDate;
      if (emId && dt) {
        try {
          await deleteStaffScheduleDayMarkForCell(supabase, localId, emId, dt);
        } catch {
          /* ignore */
        }
      }
    }
    await afterScheduleChange();
  }, [supabase, localId, afterScheduleChange]);

  const onRt = useCallback(() => {
    void reload({ silent: true });
    void refetchWeekPublication();
  }, [reload, refetchWeekPublication]);
  useStaffRealtime(localId, onRt);

  useEffect(() => {
    if (!localId || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('locals')
        .select(
          'start_operating_time, end_operating_time, allow_next_day_end, max_extended_end_time, operational_start, operational_end, operational_end_next_day, operational_extend_until',
        )
        .eq('id', localId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setOperationalWindow({ ...DEFAULT_LOCAL_OPERATIONAL_WINDOW });
        return;
      }
      setOperationalWindow(operationalWindowFromLocalsRow(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [localId, supabase]);

  useEffect(() => {
    if (!localId) {
      setCustomOperationalZones([]);
      return;
    }
    setCustomOperationalZones(readCustomOperationalZones(localId));
  }, [localId]);

  const handleAddOperationalZone = useCallback(async () => {
    if (!localId || !perms.canManageSchedules) return;
    const name = await appPrompt('Nombre del puesto', '');
    if (name == null || !name.trim()) return;
    const label = name.trim();
    let key = slugifyOperationalZoneKey(label);
    const reserved = new Set<string>(['cocina', 'barra', 'sala', OPERATIONAL_NONE_ZONE]);
    let n = 2;
    while (reserved.has(key) || customOperationalZones.some((z) => z.key === key)) {
      key = `${slugifyOperationalZoneKey(label)}-${n}`;
      n += 1;
    }
    const next = [...customOperationalZones, { key, label }];
    setCustomOperationalZones(next);
    writeCustomOperationalZones(localId, next);
  }, [localId, perms.canManageSchedules, customOperationalZones]);

  const shiftsInMonth = useMemo(() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const from = ymdLocal(new Date(y, m, 1));
    const to = ymdLocal(new Date(y, m + 1, 0));
    return shifts.filter((s) => s.shiftDate >= from && s.shiftDate <= to);
  }, [shifts, monthCursor]);

  const dayShifts = useMemo(() => shifts.filter((s) => s.shiftDate === dayFocus), [shifts, dayFocus]);

  const openNew = useCallback(
    (employeeId: string, dateYmd: string) => {
      if (!perms.canManageSchedules) return;
      if (employeeId === SHIFT_GRID_UNASSIGNED_ROW_ID) {
        setDraft({ mode: 'new', shiftDate: dateYmd });
      } else {
        setDraft({ mode: 'new', employeeId, shiftDate: dateYmd });
      }
      setModalOpen(true);
    },
    [perms.canManageSchedules],
  );

  const onOperationalEmptyLongPress = useCallback(
    (dateYmd: string, zoneRowKey: string) => {
      if (!perms.canManageSchedules) return;
      setDraft({
        mode: 'new',
        shiftDate: dateYmd,
        defaultZone: zoneRowKey === OPERATIONAL_NONE_ZONE ? undefined : zoneRowKey,
        employeeId: undefined,
      });
      setModalOpen(true);
    },
    [perms.canManageSchedules],
  );

  const openEdit = useCallback(
    (s: StaffShift) => {
      if (!perms.canManageSchedules) return;
      setDraft({ mode: 'edit', shift: s });
      setModalOpen(true);
    },
    [perms.canManageSchedules],
  );

  const openNewPersonSameSlot = useCallback(
    (template: StaffShift) => {
      if (!perms.canManageSchedules) return;
      setDraft({
        mode: 'new',
        shiftDate: template.shiftDate,
        defaultZone: template.zone ?? undefined,
        cloneSlotFrom: template,
        employeeId: undefined,
      });
      setModalOpen(true);
    },
    [perms.canManageSchedules],
  );

  const removeShiftFromPlan = useCallback(
    async (s: StaffShift) => {
      if (!perms.canManageSchedules || !supabase) return;
      await deleteStaffShift(supabase, s.id);
      await afterScheduleChange();
    },
    [perms.canManageSchedules, supabase, afterScheduleChange],
  );

  const peekShiftReadOnly = useCallback(
    (s: StaffShift) => {
      const em = s.employeeId ? employees.find((e) => e.id === s.employeeId) : null;
      const who = em ? `${em.firstName} ${em.lastName}` : 'Sin asignar';
      void appAlert(
        `${who} · ${s.shiftDate}\n${s.startTime.slice(0, 5)} – ${s.endTime.slice(0, 5)}${s.zone ? ` · ${s.zone}` : ''}`,
      );
    },
    [employees],
  );

  const copyShiftToDays = useCallback(
    async (template: StaffShift, targetYmds: string[]) => {
      if (!perms.canManageSchedules || !localId || !supabase) return;
      const empId = template.employeeId;
      if (!empId) {
        await appAlert('Solo se pueden copiar turnos con empleado asignado.');
        return;
      }
      for (const ymd of targetYmds) {
        if (ymd === template.shiftDate) continue;
        const existing = shifts.filter((s) => s.employeeId === empId && s.shiftDate === ymd);
        const mark = scheduleDayMarks.find((m) => m.employeeId === empId && m.markDate === ymd);
        if (existing.length > 0) {
          const ok = await appConfirm(
            `El ${ymd} ya tiene ${existing.length} turno(s). ¿Eliminarlos y copiar este horario?`,
          );
          if (!ok) continue;
          for (const ex of existing) {
            await deleteStaffShift(supabase, ex.id);
          }
        }
        if (mark) {
          const ok = await appConfirm(
            `El ${ymd} está marcado como ${mark.kind === 'holiday' ? 'fiesta' : 'descanso'}. ¿Quitar la marca y crear el turno copiado?`,
          );
          if (!ok) continue;
          await deleteStaffScheduleDayMark(supabase, mark.id);
        }
        await upsertStaffShift(supabase, {
          localId,
          employeeId: empId,
          shiftDate: ymd,
          startTime: template.startTime,
          endTime: template.endTime,
          endsNextDay: template.endsNextDay,
          breakMinutes: template.breakMinutes,
          zone: template.zone,
          notes: template.notes,
          status: template.status,
          colorHint: template.colorHint,
        });
      }
      await afterScheduleChange();
    },
    [perms.canManageSchedules, localId, supabase, shifts, scheduleDayMarks, afterScheduleChange],
  );

  const upsertDayMark = useCallback(
    async (employeeId: string, dateYmd: string, kind: StaffScheduleDayMarkKind) => {
      if (!perms.canManageSchedules || !localId || !supabase) return;
      const existingShifts = shifts.filter((s) => s.employeeId === employeeId && s.shiftDate === dateYmd);
      if (existingShifts.length > 0) {
        const ok = await appConfirm(
          `Este día ya tiene ${existingShifts.length} turno(s). ¿Eliminarlos y marcar ${kind === 'holiday' ? 'fiesta' : 'descanso'}?`,
        );
        if (!ok) return;
        for (const ex of existingShifts) await deleteStaffShift(supabase, ex.id);
      }
      await upsertStaffScheduleDayMark(supabase, { localId, employeeId, markDate: dateYmd, kind });
      await afterScheduleChange();
    },
    [perms.canManageSchedules, localId, supabase, shifts, afterScheduleChange],
  );

  const removeDayMark = useCallback(
    async (mark: StaffScheduleDayMark) => {
      if (!perms.canManageSchedules || !supabase) return;
      await deleteStaffScheduleDayMark(supabase, mark.id);
      await afterScheduleChange();
    },
    [perms.canManageSchedules, supabase, afterScheduleChange],
  );

  const onOperationalShiftPlaced = useCallback(
    async (shift: StaffShift, newDateYmd: string, zoneRowKey: string) => {
      if (!perms.canManageSchedules || !localId || !supabase) return;
      const zone = zoneRowKey === OPERATIONAL_NONE_ZONE ? null : zoneRowKey;
      const colorHint =
        zone != null ? zoneDefaultColorHint(zone) ?? shift.colorHint : shift.colorHint;
      try {
        await upsertStaffShift(supabase, {
          id: shift.id,
          localId,
          employeeId: shift.employeeId,
          shiftDate: newDateYmd,
          startTime: shift.startTime,
          endTime: shift.endTime,
          endsNextDay: shift.endsNextDay,
          breakMinutes: shift.breakMinutes,
          zone,
          notes: shift.notes,
          status: shift.status,
          colorHint,
        });
        void afterScheduleChange();
      } catch (e: unknown) {
        await appAlert(e instanceof Error ? e.message : 'No se pudo mover el turno');
      }
    },
    [perms.canManageSchedules, localId, supabase, afterScheduleChange],
  );

  const onOperationalQuickCreate = useCallback(
    async (dateYmd: string, zoneRowKey: string) => {
      if (!perms.canManageSchedules || !localId) return;
      const preset = resolveQuickPresetForZone(localId, zoneRowKey);
      writeStoredPresetIdForZone(localId, zoneRowKey, preset.id);
      const lastEmp = readLastEmployeeForZone(localId, zoneRowKey);
      const emp =
        lastEmp && employees.some((e) => e.id === lastEmp) ? lastEmp : undefined;
      setDraft({
        mode: 'new',
        shiftDate: dateYmd,
        defaultZone: zoneRowKey === OPERATIONAL_NONE_ZONE ? undefined : zoneRowKey,
        employeeId: emp,
        quickPreset: preset,
      });
      setModalOpen(true);
    },
    [perms.canManageSchedules, localId, employees],
  );

  const onOperationalDuplicateHere = async (shift: StaffShift) => {
    if (!perms.canManageSchedules || !localId || !supabase) {
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
    try {
      await upsertStaffShift(supabase, {
        localId,
        employeeId: shift.employeeId,
        shiftDate: shift.shiftDate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        endsNextDay: shift.endsNextDay,
        breakMinutes: shift.breakMinutes,
        zone: shift.zone,
        notes: shift.notes,
        status: 'planned',
        colorHint: shift.colorHint,
      });
      void afterScheduleChange();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'No se pudo duplicar');
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
  };

  const onOperationalCopyPrevDay = async (shift: StaffShift) => {
    if (!perms.canManageSchedules || !localId || !supabase) {
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
    const target = ymdLocal(addDays(parseYmd(shift.shiftDate), -1));
    if (target < weekStart || target > weekEndYmd) {
      await appAlert('El día anterior no está en la semana que tienes abierta.');
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
    try {
      await upsertStaffShift(supabase, {
        localId,
        employeeId: shift.employeeId,
        shiftDate: target,
        startTime: shift.startTime,
        endTime: shift.endTime,
        endsNextDay: shift.endsNextDay,
        breakMinutes: shift.breakMinutes,
        zone: shift.zone,
        notes: shift.notes,
        status: 'planned',
        colorHint: shift.colorHint,
      });
      void afterScheduleChange();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'No se pudo copiar');
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
  };

  const onOperationalCopyPrevWeekday = async (shift: StaffShift) => {
    if (!perms.canManageSchedules || !localId || !supabase) {
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
    const target = ymdLocal(addDays(parseYmd(shift.shiftDate), -7));
    if (target < weekStart || target > weekEndYmd) {
      await appAlert('La fecha −7 días no está en la semana visible. Cambia de semana o usa el modal.');
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
    try {
      await upsertStaffShift(supabase, {
        localId,
        employeeId: shift.employeeId,
        shiftDate: target,
        startTime: shift.startTime,
        endTime: shift.endTime,
        endsNextDay: shift.endsNextDay,
        breakMinutes: shift.breakMinutes,
        zone: shift.zone,
        notes: shift.notes,
        status: 'planned',
        colorHint: shift.colorHint,
      });
      void afterScheduleChange();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'No se pudo copiar');
      throw new Error(PLANIFICACION_MODAL_ABORT);
    }
  };

  const duplicateNextWeek = async () => {
    if (!perms.canManageSchedules || !localId || !supabase) return;
    const next = addDays(weekStartDate, 7);
    const toYmd = ymdLocal(next);
    if (!(await appConfirm(`¿Duplicar toda la semana al ${toYmd}?`))) return;
    try {
      const n = await duplicateShiftsWeek(supabase, localId, weekStart, toYmd);
      await appAlert(`Copiados ${n} turnos.`);
      void reload({ silent: true });
      void refetchWeekPublication();
    } catch (e: unknown) {
      await appAlert(e instanceof Error ? e.message : 'Error al duplicar');
    }
  };

  const handlePublishWeek = async () => {
    if (!localId || !supabase) return;
    if (!userId) {
      void appAlert('Vuelve a iniciar sesión para publicar el cuadrante.');
      return;
    }
    const shiftsThisWeek = shifts.filter((s) => s.shiftDate >= weekStart && s.shiftDate <= weekEndYmd);
    if (shiftsThisWeek.length === 0) {
      void appAlert('No puedes publicar una semana sin turnos.');
      return;
    }
    const republish = weekPublication?.status === 'updated_after_publish';
    setPublishBusy(true);
    try {
      const pub = await upsertPublishStaffWeek(supabase, {
        localId,
        weekStartMondayYmd: weekStart,
        publishedBy: userId,
      });
      const targetUserIds = collectUserIdsWithShiftsInWeek(shifts, employees, weekStart, weekEndYmd);
      await notifyStaffWeekSchedulePublished(supabase, {
        localId,
        weekStartMondayYmd: weekStart,
        publicationId: pub.id,
        createdBy: userId,
        republish,
        targetUserIds,
      });
      setWeekPublication(pub);
      if (targetUserIds.length === 0) {
        void appAlert(
          'Semana publicada. Ningún empleado con turno tiene usuario vinculado, así que no se ha enviado aviso en notificaciones.',
        );
      }
    } catch (e: unknown) {
      void appAlert(e instanceof Error ? e.message : 'No se pudo publicar la semana.');
    } finally {
      setPublishBusy(false);
    }
  };

  if (!profileReady) return <p className="text-sm text-zinc-500">Cargando…</p>;
  if (!localId) {
    return <p className="text-sm text-amber-800">Sin local asignado.</p>;
  }
  if (!perms.canManageSchedules) {
    return (
      <div className="space-y-4">
        <MermasStyleHero title="HORARIOS Y FICHAJES" compact />
        <PersonalSectionNav />
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-800">Tu planificación semanal está en la vista principal.</p>
          <Link
            href="/personal"
            className="mt-3 inline-flex rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-800"
          >
            Ver horario
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MermasStyleHero
        eyebrow="Cuadrante"
        title="Planificación"
        tagline="Semana: cuadrante por puesto (vista principal) o por empleado; franja 00:00–24:00 y arrastre (encargados)."
        compact
      />
      <PersonalSectionNav />

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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 p-2"
                  onClick={() => setWeekStart((w) => ymdLocal(addDays(parseYmd(w), -7)))}
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-bold text-zinc-800">Semana del {weekStart}</span>
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
                <span
                  className={[
                    'rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide sm:text-[11px]',
                    !weekPublication
                      ? 'bg-zinc-200 text-zinc-800'
                      : weekPublication.status === 'published'
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-950',
                  ].join(' ')}
                >
                  {!weekPublication
                    ? 'Borrador'
                    : weekPublication.status === 'published'
                      ? 'Publicada'
                      : 'Modificada tras publicación'}
                </span>
              ) : null}
            </div>
            {perms.canManageSchedules ? (
              <div className="flex flex-wrap items-center gap-2">
                {!weekPublication ? (
                  <button
                    type="button"
                    disabled={publishBusy || loading}
                    onClick={() => void handlePublishWeek()}
                    className="rounded-2xl bg-[#D32F2F] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                  >
                    {publishBusy ? 'Publicando…' : 'Publicar semana'}
                  </button>
                ) : weekPublication.status === 'updated_after_publish' ? (
                  <button
                    type="button"
                    disabled={publishBusy || loading}
                    onClick={() => void handlePublishWeek()}
                    className="rounded-2xl bg-amber-600 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                  >
                    {publishBusy ? 'Publicando…' : 'Volver a publicar cambios'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void duplicateNextWeek()}
                  className="flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-xs font-extrabold text-white"
                >
                  <Copy className="h-4 w-4" />
                  Duplicar semana →
                </button>
              </div>
            ) : null}
          </div>
          {perms.canManageSchedules && weekPublication?.status === 'updated_after_publish' ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
              Has cambiado turnos tras publicar el cuadrante. El equipo no recibirá un aviso hasta que pulses
              «Volver a publicar cambios».
            </p>
          ) : null}
          {perms.canManageSchedules && weekPublication?.status === 'published' ? (
            <p className="text-xs font-semibold text-zinc-500">
              Publicada el{' '}
              {new Date(weekPublication.publishedAt).toLocaleString('es-ES', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {(['operativo', 'empleados'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWeekLayout(k)}
                className={[
                  'rounded-full px-3 py-1.5 text-[11px] font-extrabold sm:text-xs',
                  weekLayout === k ? 'bg-[#D32F2F] text-white' : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
                ].join(' ')}
              >
                {k === 'empleados' ? 'Por empleado' : 'Por puesto'}
              </button>
            ))}
          </div>
          {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}
          {!perms.canManageSchedules ? (
            <p className="text-sm text-zinc-600">Solo lectura: pide a un encargado los cambios de cuadrante.</p>
          ) : null}
          {weekLayout === 'empleados' ? (
            <ShiftWeekGrid
              weekStartMonday={weekStartDate}
              employees={employeesForShiftWeekGrid}
              shifts={shifts}
              scheduleDayMarks={scheduleDayMarks}
              canManageSchedules={perms.canManageSchedules}
              onEditShift={perms.canManageSchedules ? openEdit : peekShiftReadOnly}
              onNewShift={openNew}
              onRemoveShift={perms.canManageSchedules ? removeShiftFromPlan : undefined}
              onCopyShiftToDays={perms.canManageSchedules ? copyShiftToDays : undefined}
              onUpsertDayMark={perms.canManageSchedules ? upsertDayMark : undefined}
              onRemoveDayMark={perms.canManageSchedules ? removeDayMark : undefined}
            />
          ) : (
            <OperationalWeekGrid
              weekStartMonday={weekStartDate}
              employees={employees}
              shifts={shifts}
              operationalWindow={operationalWindow}
              customOperationalZones={customOperationalZones}
              onAddOperationalZone={handleAddOperationalZone}
              canEdit={perms.canManageSchedules}
              onShiftPlaced={onOperationalShiftPlaced}
              onQuickCreateShift={onOperationalQuickCreate}
              onEmptyLongPress={onOperationalEmptyLongPress}
              onShiftAdvancedEdit={openEdit}
              onAddPersonSameSlot={(t) => openNewPersonSameSlot(t)}
              onRemoveShift={(s) => removeShiftFromPlan(s)}
            />
          )}
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
                const em = s.employeeId ? employees.find((e) => e.id === s.employeeId) : null;
                const who = em ? `${em.firstName} ${em.lastName}` : 'Sin asignar';
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={!perms.canManageSchedules}
                      onClick={() => openEdit(s)}
                      className="w-full rounded-2xl bg-zinc-50 px-4 py-3 text-left text-sm font-bold ring-1 ring-zinc-200 disabled:opacity-60"
                    >
                      {who} · {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
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
          onSaved={() => void handleShiftModalSaved()}
          canDelete={perms.canManageSchedules}
          operationalExtraZones={customOperationalZones.map((z) => ({ value: z.key, label: z.label }))}
          onDuplicateFromModal={
            weekLayout === 'operativo' ? (s) => onOperationalDuplicateHere(s) : undefined
          }
          onCopyPrevCalendarDayFromModal={
            weekLayout === 'operativo' ? (s) => onOperationalCopyPrevDay(s) : undefined
          }
          onCopyPrevWeekdayFromModal={
            weekLayout === 'operativo' ? (s) => onOperationalCopyPrevWeekday(s) : undefined
          }
          existingShifts={shifts}
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
