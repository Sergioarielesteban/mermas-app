'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, RefreshCw, Settings } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import { findShiftForToday, getClockSessionState, todayYmd } from '@/lib/staff/attendance-logic';
import {
  fetchRecentStaffTimeEntriesForEmployee,
  fetchShiftsRange,
  recordStaffTimeEvent,
  staffDisplayName,
  staffKioskResolveByPin,
} from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { StaffTimeEventType } from '@/lib/staff/types';
import Logo from '@/components/Logo';
import { goBackOrToPanel } from '@/lib/navigate-back-or-fallback';

type Step = 'home' | 'pin' | 'choose_out' | 'success';

const MOTIVATIONAL_MESSAGES = [
  'Hoy no se trata de hacerlo perfecto, sino de trabajar con actitud, oficio y constancia.',
  'Cada servicio es una oportunidad para demostrar profesionalidad, calma y compromiso.',
  'La excelencia no está en correr más, está en trabajar mejor, con cabeza y con equipo.',
  'Un buen día empieza con una buena actitud. Lo demás se construye paso a paso.',
  'El oficio se nota en los detalles: puntualidad, respeto, orden y ganas de hacerlo bien.',
  'Trabajar bien también es una forma de crecer. Hoy cuenta.',
  'La diferencia la marcan las personas que hacen bien lo importante, incluso cuando nadie mira.',
  'Un equipo fuerte empieza por pequeños actos: llegar, cumplir y sumar.',
];

const THANK_YOU_MESSAGES = [
  'Gracias por tu compromiso de hoy. El buen trabajo también se construye cuando nadie mira.',
  'Turno finalizado. Gracias por tu esfuerzo, tu tiempo y tu profesionalidad.',
  'Gracias por sumar al equipo. Cada servicio bien sacado tiene detrás personas como tú.',
  'Buen trabajo. Descansa, desconecta y vuelve con la misma actitud.',
  'Gracias por tu entrega. La constancia de cada día sostiene a un gran equipo.',
  'Turno cerrado. Gracias por haber estado, por cumplir y por aportar.',
  'Gracias por tu trabajo de hoy. Los buenos equipos se construyen con personas comprometidas.',
  'Servicio terminado. Gracias por tu esfuerzo y por formar parte del equipo.',
];

const BREAK_MESSAGES = [
  'Disfruta tu descanso. Una pausa bien hecha también forma parte de un buen servicio.',
  'Buen descanso. Recargar energía también es trabajar con inteligencia.',
  'Tómate tu pausa. Volver con calma también ayuda al equipo.',
];

const BACK_MESSAGES = [
  'Bienvenido de nuevo. Seguimos con cabeza, actitud y buen ritmo.',
  'Vamos de nuevo. La constancia también se demuestra después de la pausa.',
  'De vuelta al servicio. Paso a paso y bien hecho.',
];

const PIN_ERR: Record<string, string> = {
  no_match: 'Código incorrecto',
  forbidden: 'Esta tablet debe tener sesión de encargado',
  ambiguous: 'Hay dos fichas con el mismo PIN. Revisa Equipo.',
  invalid_pin: 'El PIN debe tener 4 dígitos',
  not_authenticated: 'Sesión caducada. Vuelve a entrar.',
  no_local: 'Sin local asignado',
  invalid_response: 'Error del servidor',
  unknown: 'No se pudo validar',
};

function pickMessage(list: string[]) {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? '';
}
function formatBreakDuration(minutes: number) {
  if (minutes < 1) return 'menos de 1 minuto';
  if (minutes === 1) return '1 minuto';
  if (minutes < 60) return `${minutes} minutos`;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`;

  return `${h} h ${m} min`;
}

function initials(first: string, last: string, alias: string | null): string {
  const a = alias?.trim();
  if (a) return a.slice(0, 2).toUpperCase();
  const f = (first.trim()[0] ?? '?').toUpperCase();
  const l = (last.trim()[0] ?? '').toUpperCase();
  return (f + l).slice(0, 2);
}

function displayFirstName(first: string, alias: string | null): string {
  const a = alias?.trim();
  if (a) return a.split(/\s+/)[0] ?? a;
  return first.trim() || 'compañero';
}

function friendlyFichajeRpcMessage(raw: string): string {
  const m = raw.trim();

  if (m.includes('PIN de fichaje incorrecto')) return 'Código incorrecto';

  if (m.includes('Secuencia de fichaje inválida')) {
    return 'El PIN es correcto, pero esta acción no toca ahora. Puede haber una entrada abierta de otro día. Prueba Salida o pide al encargado que revise el último fichaje.';
  }

  if (m.includes('Primero debes fichar la entrada')) return 'Primero debes fichar la llegada.';
  if (m.includes('Ya cerraste la jornada')) return 'La jornada ya está cerrada. Ficha llegada para empezar otra.';
  if (m.includes('Debes finalizar la pausa')) return 'Estás en pausa: primero fin de pausa, después puedes salir.';

  return m;
}

export default function TerminalFichajePage() {
  const router = useRouter();
  const { localId, localName, profileReady, profileRole } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const supabase = getSupabaseClient();

  const [now, setNow] = useState(() => new Date());
  const [step, setStep] = useState<Step>('home');
  const [pendingAction, setPendingAction] = useState<'clock_in' | 'clock_out' | null>(null);

  const [pendingResolved, setPendingResolved] = useState<{
    employeeId: string;
    firstName: string;
    lastName: string;
    alias: string | null;
    fullPin: string;
    shiftId: string | null;
  } | null>(null);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [successAt, setSuccessAt] = useState<string | null>(null);
  const [successAction, setSuccessAction] = useState<StaffTimeEventType | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [resolved, setResolved] = useState<{
    employeeId: string;
    firstName: string;
    lastName: string;
    alias: string | null;
  } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now],
  );

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [now],
  );

  const resetFlow = useCallback(() => {
    setStep('home');
    setPendingAction(null);
    setPendingResolved(null);
    setPin('');
    setBanner(null);
    setResolved(null);
    setSuccessAt(null);
    setSuccessAction(null);
    setSuccessMessage(null);
  }, []);

  const goPin = (action: 'clock_in' | 'clock_out') => {
    setBanner(null);
    setPendingAction(action);
    setPendingResolved(null);
    setPin('');
    setStep('pin');
  };

  const appendDigit = (d: string) => {
    if (pin.length >= 4 || busy) return;

    const next = pin + d;
    setPin(next);

    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const finishSuccess = ({
    employeeId,
    firstName,
    lastName,
    alias,
    action,
    message,
  }: {
    employeeId: string;
    firstName: string;
    lastName: string;
    alias: string | null;
    action: StaffTimeEventType;
    message: string;
  }) => {
    const at = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    setResolved({
      employeeId,
      firstName,
      lastName,
      alias,
    });

    setSuccessAction(action);
    setSuccessAt(at);
    setSuccessMessage(message);
    setStep('success');
    setPin('');
  };

  const submitPin = async (fullPin: string) => {
    if (!supabase || !localId || !pendingAction) return;

    setBusy(true);
    setBanner(null);

    try {
      const r = await staffKioskResolveByPin(supabase, fullPin);

      if (!r.ok) {
        setBanner(PIN_ERR[r.error] ?? PIN_ERR.unknown);
        setPin('');
        return;
      }

      const ymd = todayYmd();

      const [recentEntries, shifts] = await Promise.all([
        fetchRecentStaffTimeEntriesForEmployee(supabase, localId, r.employeeId, 48),
        fetchShiftsRange(supabase, localId, ymd, ymd),
      ]);

      const session = getClockSessionState(recentEntries);
      const want: StaffTimeEventType = pendingAction;
      if (String(session.lastEventType) === 'break_start') {
        const lastBreakStart = [...recentEntries]
          .reverse()
          .find((entry) => entry.eventType === 'break_start');
      
        const breakMinutes = lastBreakStart
          ? Math.max(
              0,
              Math.round(
                (Date.now() - new Date(lastBreakStart.occurredAt).getTime()) / 60000
              )
            )
          : 0;
      
        const planned = findShiftForToday(shifts, r.employeeId, ymd);
        const shiftId = planned?.id ?? null;
      
        if (want === 'clock_in') {
          await recordStaffTimeEvent(supabase, {
            employeeId: r.employeeId,
            eventType: 'break_end',
            shiftId,
            pin: fullPin,
            origin: 'device',
          });
      
          finishSuccess({
            employeeId: r.employeeId,
            firstName: r.firstName,
            lastName: r.lastName,
            alias: r.alias,
            action: 'break_end',
            message: `Has estado ${formatBreakDuration(
              breakMinutes
            )} de descanso. A seguir con el turno, con calma y buen ritmo.`,
          });
      
          return;
        }
      
        setBanner('Estás en descanso. Para continuar, pulsa LLEGADA y vuelve al turno.');
        setPin('');
        return;
      }

      if (!session.availableActions.includes(want)) {
        const open = session.lastEventType != null && session.lastEventType !== 'clock_out';

        const hint =
          want === 'clock_in'
            ? open
              ? 'Ya tienes jornada abierta. Ficha Salida antes de una nueva Llegada, o pide al encargado que revise fichajes.'
              : 'No puedes fichar llegada ahora.'
            : session.lastEventType == null
              ? 'No hay entrada registrada: ficha Llegada primero.'
              : 'No puedes fichar salida en este momento. Puede que estés en pausa.';

        setBanner(hint);
        setPin('');
        return;
      }

      const planned = findShiftForToday(shifts, r.employeeId, ymd);
      const shiftId = planned?.id ?? null;

      if (session.lastEventType === 'break_start') {
        await recordStaffTimeEvent(supabase, {
          employeeId: r.employeeId,
          eventType: 'break_end',
          shiftId,
          pin: fullPin,
          origin: 'device',
        });

        finishSuccess({
          employeeId: r.employeeId,
          firstName: r.firstName,
          lastName: r.lastName,
          alias: r.alias,
          action: 'break_end',
          message: pickMessage(BACK_MESSAGES),
        });

        return;
      }

      if (want === 'clock_out' && session.availableActions.includes('break_start')) {
        setPendingResolved({
          employeeId: r.employeeId,
          firstName: r.firstName,
          lastName: r.lastName,
          alias: r.alias,
          fullPin,
          shiftId,
        });

        setStep('choose_out');
        setPin('');
        return;
      }

      await recordStaffTimeEvent(supabase, {
        employeeId: r.employeeId,
        eventType: want,
        shiftId,
        pin: fullPin,
        origin: 'device',
      });

      finishSuccess({
        employeeId: r.employeeId,
        firstName: r.firstName,
        lastName: r.lastName,
        alias: r.alias,
        action: want,
        message:
          want === 'clock_in'
            ? pickMessage(MOTIVATIONAL_MESSAGES)
            : pickMessage(THANK_YOU_MESSAGES),
      });
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Error al fichar';
      setBanner(friendlyFichajeRpcMessage(raw));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const recordOutChoice = async (eventType: 'break_start' | 'clock_out') => {
    if (!supabase || !pendingResolved) return;

    setBusy(true);
    setBanner(null);

    try {
      await recordStaffTimeEvent(supabase, {
        employeeId: pendingResolved.employeeId,
        eventType,
        shiftId: pendingResolved.shiftId,
        pin: pendingResolved.fullPin,
        origin: 'device',
      });

      finishSuccess({
        employeeId: pendingResolved.employeeId,
        firstName: pendingResolved.firstName,
        lastName: pendingResolved.lastName,
        alias: pendingResolved.alias,
        action: eventType,
        message:
          eventType === 'break_start'
            ? pickMessage(BREAK_MESSAGES)
            : pickMessage(THANK_YOU_MESSAGES),
      });

      setPendingResolved(null);
    } catch (e: unknown) {
      setBanner(friendlyFichajeRpcMessage(e instanceof Error ? e.message : 'Error al fichar'));
      setStep('pin');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#fbfaf8] text-zinc-500">
        Cargando…
      </div>
    );
  }

  if (!localId || !supabase) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#fbfaf8] px-6 text-center text-zinc-600">
        <p>No hay local o conexión. Abre esta pantalla con un usuario configurado.</p>
        <Link href="/login" className="font-bold text-[#D71920] underline">
          Ir al acceso
        </Link>
      </div>
    );
  }

  if (!perms.canOperateAttendanceTerminal) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#fbfaf8] px-6 text-center text-zinc-800">
        <p className="text-lg font-semibold text-zinc-900">Terminal solo para encargados</p>
        <p className="max-w-sm text-sm text-zinc-600">
          Inicia sesión con un perfil <strong className="text-zinc-900">admin</strong> o{' '}
          <strong className="text-zinc-900">manager</strong> en esta tablet.
        </p>
        <button
          type="button"
          onClick={() => goBackOrToPanel(router)}
          className="rounded-2xl bg-zinc-900 px-6 py-3 text-sm font-extrabold text-white"
        >
          Ir al panel
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#fbfaf8] text-zinc-950">
      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8">
        {step === 'success' && resolved ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-900 text-sm font-extrabold text-white shadow-sm">
              {initials(resolved.firstName, resolved.lastName, resolved.alias)}
            </div>

            <p className="truncate text-base font-extrabold">
              {staffDisplayName({
                firstName: resolved.firstName,
                lastName: resolved.lastName,
                alias: resolved.alias,
              })}
            </p>

            <button
              type="button"
              onClick={resetFlow}
              className="ml-auto shrink-0 text-sm font-bold text-[#D71920]"
            >
              No soy yo
            </button>
          </div>
        ) : (
          <>
            <div className="w-16" />

            <Logo variant="inline" className="!h-8 sm:!h-10" />

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="grid h-11 w-11 place-items-center rounded-full bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                aria-label="Actualizar"
              >
                <RefreshCw className="h-5 w-5" />
              </button>

              <Link
                href="/personal/fichaje"
                className="grid h-11 w-11 place-items-center rounded-full bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                aria-label="Ajustes fichaje"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </>
        )}
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8 sm:px-8">
        {step === 'home' ? (
          <section className="w-full max-w-5xl rounded-[34px] border border-zinc-100 bg-white px-5 py-8 text-center shadow-[0_24px_90px_rgba(15,23,42,0.08)] sm:px-10 sm:py-10 lg:px-16">
            <h1 className="font-serif text-5xl font-semibold tracking-tight text-[#D71920] sm:text-6xl md:text-7xl">
              Chef One
            </h1>

            <p className="mt-4 text-lg font-extrabold text-zinc-950 sm:text-xl">
              ¡Hola, bienvenido/a! 👋
            </p>

            <p className="mt-1 text-sm font-semibold capitalize text-zinc-400 sm:text-base">
              {dateLabel}
            </p>

            <div className="mt-6 text-[74px] font-black leading-none tracking-[-0.07em] text-zinc-950 sm:text-[118px] md:text-[138px]">
              {timeLabel}
            </div>

            <p className="mt-3 text-xs font-bold text-zinc-400 sm:text-sm">
              {localName ?? 'Local'}
            </p>

            <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => goPin('clock_in')}
                className="flex min-h-[66px] items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-base font-black uppercase tracking-wide text-[#D71920] shadow-sm transition hover:bg-zinc-50 active:scale-[0.99] sm:min-h-[72px]"
                aria-label="Llegada de turno"
              >
                <span className="text-3xl">↪</span>
                LLEGADA
              </button>

              <button
                type="button"
                onClick={() => goPin('clock_out')}
                className="flex min-h-[66px] items-center justify-center gap-3 rounded-2xl bg-[#D71920] px-5 text-base font-black uppercase tracking-wide text-white shadow-[0_14px_34px_rgba(215,25,32,0.25)] transition hover:bg-[#b9151b] active:scale-[0.99] sm:min-h-[72px]"
                aria-label="Salida de turno"
              >
                <span className="text-3xl">↩</span>
                SALIDA
              </button>
            </div>

            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
              Modo terminal · sesión de encargado
            </p>
          </section>
        ) : null}

        {step === 'pin' ? (
          <section className="w-full max-w-md rounded-[34px] border border-zinc-100 bg-white px-5 py-7 text-center shadow-[0_24px_90px_rgba(15,23,42,0.08)] sm:px-8">
            <button
              type="button"
              onClick={resetFlow}
              className="mb-5 text-sm font-bold text-zinc-400 hover:text-zinc-900"
            >
              Cancelar
            </button>

            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
              <Lock className="h-9 w-9 text-[#D71920]" strokeWidth={2.2} />
            </div>

            <p className="mt-5 text-xl font-extrabold text-zinc-950">
              Introduce tu código PIN
            </p>

            <div className="mt-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={[
                    'h-3 w-3 rounded-full border border-zinc-300 transition-colors',
                    pin.length > i ? 'border-[#D71920] bg-[#D71920]' : 'bg-transparent',
                  ].join(' ')}
                />
              ))}
            </div>

            {banner ? (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {banner}
              </p>
            ) : null}

            <div className="mt-8 grid w-full grid-cols-3 justify-items-center gap-x-5 gap-y-4 text-3xl font-bold text-zinc-950 sm:text-4xl">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => appendDigit(n)}
                  className="grid h-16 w-16 place-items-center rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40"
                >
                  {n}
                </button>
              ))}

              <div />

              <button
                type="button"
                disabled={busy}
                onClick={() => appendDigit('0')}
                className="grid h-16 w-16 place-items-center rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40"
              >
                0
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPin((p) => p.slice(0, -1));
                  setBanner(null);
                }}
                className="h-16 text-sm font-extrabold uppercase tracking-wide text-zinc-400 hover:text-zinc-900"
              >
                Borrar
              </button>
            </div>
          </section>
        ) : null}

        {step === 'choose_out' && pendingResolved ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-50 bg-black/40"
              aria-hidden
              onClick={() => {
                setStep('pin');
                setPendingResolved(null);
              }}
            />

            <section className="fixed inset-x-4 bottom-4 z-[60] rounded-[30px] bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2">
              <p className="text-sm font-bold text-zinc-400">
                {staffDisplayName({
                  firstName: pendingResolved.firstName,
                  lastName: pendingResolved.lastName,
                  alias: pendingResolved.alias,
                })}
              </p>

              <h3 className="mt-1 text-2xl font-black text-zinc-950">
                ¿Qué quieres registrar?
              </h3>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recordOutChoice('break_start')}
                  className="min-h-[58px] rounded-2xl bg-amber-500 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Voy al descanso
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void recordOutChoice('clock_out')}
                  className="min-h-[58px] rounded-2xl bg-[#D71920] text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Acabo el turno
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep('pin');
                    setPendingResolved(null);
                  }}
                  className="min-h-[54px] rounded-2xl bg-zinc-100 text-base font-black text-zinc-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </section>
          </>
        ) : null}

        {step === 'success' && resolved && successAt && successAction ? (
          <section className="w-full max-w-md rounded-[34px] border border-zinc-100 bg-white px-5 py-7 text-center shadow-[0_24px_90px_rgba(15,23,42,0.08)] sm:px-8">
            <div className="text-5xl">
              {successAction === 'clock_in'
                ? '👋'
                : successAction === 'break_start'
                  ? '☕'
                  : successAction === 'break_end'
                    ? '👋'
                    : '🫡'}
            </div>

            <h2 className="mt-4 text-2xl font-black text-zinc-950 sm:text-3xl">
              {successAction === 'clock_out'
                ? `¡Adiós ${displayFirstName(resolved.firstName, resolved.alias)}!`
                : successAction === 'break_start'
                  ? `Buen descanso, ${displayFirstName(resolved.firstName, resolved.alias)}`
                  : successAction === 'break_end'
                    ? `Bienvenido de nuevo, ${displayFirstName(resolved.firstName, resolved.alias)}`
                    : `¡Hola ${displayFirstName(resolved.firstName, resolved.alias)}!`}
            </h2>

            {successMessage ? (
              <p className="mx-auto mt-5 max-w-sm text-balance text-xl font-semibold leading-relaxed text-zinc-500 sm:text-2xl">
                <span className="px-1 text-2xl font-black text-[#D71920]">“</span>
                {successMessage}
                <span className="px-1 text-2xl font-black text-[#D71920]">”</span>
              </p>
            ) : null}

            <p className="mt-5 text-sm font-medium text-zinc-500">
              Registro completado a las
            </p>

            <div className="mt-5 rounded-3xl bg-zinc-50 px-4 py-5 text-center ring-1 ring-zinc-200">
              <span className="text-5xl font-black tabular-nums tracking-[-0.05em] text-zinc-950 sm:text-6xl">
                {successAt}
              </span>
            </div>

            <button
              type="button"
              onClick={resetFlow}
              className="mt-7 min-h-[58px] w-full rounded-2xl bg-[#D71920] text-lg font-black text-white shadow-[0_14px_34px_rgba(215,25,32,0.22)] transition active:scale-[0.99]"
            >
              Aceptar
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}