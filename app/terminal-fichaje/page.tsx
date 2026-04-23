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

/** La RPC usa el último fichaje global del empleado; mensajes crípticos → texto claro. */
function friendlyFichajeRpcMessage(raw: string): string {
  const m = raw.trim();
  if (m.includes('PIN de fichaje incorrecto')) return 'Código incorrecto';
  if (m.includes('Secuencia de fichaje inválida')) {
    return 'El PIN es correcto, pero esta acción no toca ahora: suele pasar si hay una entrada abierta (a veces de otro día). Prueba Salida, o pide al encargado que revise el último fichaje.';
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
  const [successPhrase, setSuccessPhrase] = useState<string | null>(null);
  const [successEmoji, setSuccessEmoji] = useState<string | null>(null);
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
    setSuccessPhrase(null);
    setSuccessEmoji(null);
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
      if (!session.availableActions.includes(want)) {
        const open =
          session.lastEventType != null && session.lastEventType !== 'clock_out';
        const hint =
          want === 'clock_in'
            ? open
              ? 'Ya tienes jornada abierta (puede ser de otro día sin salida). Ficha Salida antes de una nueva Llegada, o pide al encargado que revise fichajes.'
              : 'No puedes fichar llegada ahora.'
            : session.lastEventType == null
              ? 'No hay entrada registrada: ficha Llegada primero.'
              : 'No puedes fichar salida en este momento (¿estás en pausa?).';
        setBanner(hint);
        setPin('');
        return;
      }

      const planned = findShiftForToday(shifts, r.employeeId, ymd);
      const shiftId = planned?.id ?? null;

      if (want === 'clock_out' && session.lastEventType === 'break_start') {
        await recordStaffTimeEvent(supabase, {
          employeeId: r.employeeId,
          eventType: 'break_end',
          shiftId,
          pin: fullPin,
          origin: 'device',
        });
        const at = new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        setResolved({
          employeeId: r.employeeId,
          firstName: r.firstName,
          lastName: r.lastName,
          alias: r.alias,
        });
        setSuccessAction('break_end');
        setSuccessAt(at);
        setSuccessPhrase('Bienvenido de nuevo');
        setSuccessEmoji('👋');
        setStep('success');
        setPin('');
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

      const at = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setResolved({
        employeeId: r.employeeId,
        firstName: r.firstName,
        lastName: r.lastName,
        alias: r.alias,
      });
      setSuccessAction(want);
      setSuccessAt(at);
      if (want === 'clock_in') {
        setSuccessPhrase(`Hola, ${displayFirstName(r.firstName, r.alias)}`);
        setSuccessEmoji('👋');
      } else {
        setSuccessPhrase('Adiós');
        setSuccessEmoji('🫡');
      }
      setStep('success');
      setPin('');
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
      const at = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setResolved({
        employeeId: pendingResolved.employeeId,
        firstName: pendingResolved.firstName,
        lastName: pendingResolved.lastName,
        alias: pendingResolved.alias,
      });
      setSuccessAction(eventType);
      setSuccessAt(at);
      if (eventType === 'break_start') {
        setSuccessPhrase('Buen descanso');
        setSuccessEmoji('☕');
      } else {
        setSuccessPhrase('Adiós');
        setSuccessEmoji('🫡');
      }
      setStep('success');
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-white text-zinc-500">
        Cargando…
      </div>
    );
  }

  if (!localId || !supabase) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-6 text-center text-zinc-600">
        <p>No hay local o conexión. Abre esta pantalla con un usuario configurado.</p>
        <Link href="/login" className="font-bold text-emerald-600 underline">
          Ir al acceso
        </Link>
      </div>
    );
  }

  if (!perms.canManageSchedules) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-6 text-center text-zinc-800">
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
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#ffffff] text-zinc-900">
      <header className="relative z-10 flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        {step === 'success' && resolved ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky-600 text-sm font-extrabold text-white shadow-lg">
              {initials(resolved.firstName, resolved.lastName, resolved.alias)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold sm:text-lg">
                {staffDisplayName({
                  firstName: resolved.firstName,
                  lastName: resolved.lastName,
                  alias: resolved.alias,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={resetFlow}
              className="ml-auto shrink-0 text-sm font-bold text-sky-600 underline-offset-4 hover:underline"
            >
              ¡No soy yo!
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate font-serif text-lg font-bold text-zinc-900 sm:text-xl">
                {localName ?? 'Local'}
              </p>
              <p className="text-sm font-medium capitalize text-zinc-500">{dateLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="grid h-11 w-11 place-items-center rounded-full bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-200/80"
                aria-label="Actualizar"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              <Link
                href="/personal/fichaje"
                className="grid h-11 w-11 place-items-center rounded-full bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-200/80"
                aria-label="Ajustes fichaje"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          </div>
        )}
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-6 sm:px-8">
        {step === 'home' ? (
          <>
            <div className="mb-4 flex w-full justify-center px-2 sm:mb-6">
              <Logo variant="inline" className="mx-auto !h-[min(40vmin,9rem)] sm:!h-[min(36vmin,8.5rem)]" />
            </div>
            <p className="text-7xl font-black tabular-nums tracking-tight text-zinc-900 sm:text-8xl">{timeLabel}</p>
            <div className="mt-10 grid w-full max-w-lg grid-cols-2 gap-4 sm:mt-14 sm:gap-5">
              <button
                type="button"
                onClick={() => goPin('clock_in')}
                className="min-h-[88px] rounded-3xl bg-zinc-100 py-6 text-xl font-extrabold text-zinc-900 ring-1 ring-zinc-200/90 shadow-sm transition hover:bg-zinc-200/70 active:scale-[0.98] sm:min-h-[100px] sm:text-2xl"
              >
                Llegada
              </button>
              <button
                type="button"
                onClick={() => goPin('clock_out')}
                className="min-h-[88px] rounded-3xl bg-sky-600 py-6 text-xl font-extrabold text-white shadow-lg shadow-sky-900/25 transition hover:bg-sky-500 active:scale-[0.98] sm:min-h-[100px] sm:text-2xl"
              >
                Salida
              </button>
            </div>
            <p className="mt-10 text-center text-[11px] font-medium text-zinc-400">
              Modo terminal · sesión de encargado
            </p>
          </>
        ) : null}

        {step === 'pin' ? (
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <Logo variant="inline" className="mb-5 !h-[min(36vmin,8rem)] sm:!h-[min(34vmin,7.75rem)]" />
            <button
              type="button"
              onClick={resetFlow}
              className="mb-6 text-sm font-bold text-zinc-500 hover:text-zinc-900"
            >
              ← Volver
            </button>
            <div className="relative mb-6">
              <div className="absolute -inset-6 rounded-full border border-zinc-200/70 bg-zinc-100/50" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-zinc-50/90 ring-2 ring-amber-400/55 shadow-sm">
                <Lock className="h-10 w-10 text-amber-600" strokeWidth={2.2} />
              </div>
            </div>
            <p className="text-xl font-semibold text-zinc-900">Introduce tu código PIN</p>
            <div className="mt-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={[
                    'h-3 w-3 rounded-full border border-zinc-300 transition-colors',
                    pin.length > i ? 'border-sky-500 bg-sky-500' : 'bg-transparent',
                  ].join(' ')}
                />
              ))}
            </div>
            {banner ? (
              <p className="mt-4 max-w-[90%] text-sm font-semibold text-amber-700">{banner}</p>
            ) : null}
            <div className="mt-10 grid w-full max-w-xs grid-cols-3 justify-items-center gap-x-6 gap-y-5 text-3xl font-semibold text-zinc-900 sm:text-4xl">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => appendDigit(n)}
                  className="h-14 w-full max-w-[4.5rem] rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200/80 disabled:opacity-40 sm:h-16"
                >
                  {n}
                </button>
              ))}
              <div />
              <button
                type="button"
                disabled={busy}
                onClick={() => appendDigit('0')}
                className="h-14 w-full max-w-[4.5rem] rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200/80 disabled:opacity-40 sm:h-16"
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
                className="h-14 text-sm font-extrabold uppercase tracking-wide text-zinc-500 hover:text-zinc-900 sm:h-16"
              >
                Borrar
              </button>
            </div>
          </div>
        ) : null}

        {step === 'choose_out' && pendingResolved ? (
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <Logo variant="inline" className="mb-5 !h-[min(36vmin,8rem)] sm:!h-[min(34vmin,7.75rem)]" />
            <p className="text-xl font-extrabold text-zinc-900">¿Te vas al descanso o acabaste turno?</p>
            <p className="mt-2 text-sm font-medium text-zinc-600">
              {staffDisplayName({
                firstName: pendingResolved.firstName,
                lastName: pendingResolved.lastName,
                alias: pendingResolved.alias,
              })}
            </p>
            <div className="mt-6 grid w-full grid-cols-1 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void recordOutChoice('break_start')}
                className="min-h-[64px] rounded-2xl bg-amber-500 text-lg font-extrabold text-white shadow-lg"
              >
                Me voy al descanso
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void recordOutChoice('clock_out')}
                className="min-h-[64px] rounded-2xl bg-sky-600 text-lg font-extrabold text-white shadow-lg"
              >
                He acabado mi turno
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep('pin');
                  setPendingResolved(null);
                }}
                className="mt-1 text-sm font-bold text-zinc-500"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {step === 'success' && resolved && successAt && successAction ? (
          <div
            className={[
              'w-full max-w-md rounded-[2rem] border bg-[#ffffff] p-6 shadow-xl shadow-zinc-900/10 ring-1 sm:p-8',
              successAction === 'clock_in'
                ? 'border-emerald-200 ring-emerald-100'
                : 'border-amber-200 ring-amber-100',
            ].join(' ')}
          >
            <div className="flex justify-center">
              <Logo variant="inline" className="!h-[min(36vmin,8rem)] sm:!h-[min(34vmin,7.75rem)]" />
            </div>
            <div className="mt-4 text-center text-5xl leading-none">{successEmoji ?? '✨'}</div>
            <h2 className="mt-3 text-center text-2xl font-extrabold text-zinc-900 sm:text-3xl">
              {successAction === 'clock_out'
                ? `¡Adiós ${displayFirstName(resolved.firstName, resolved.alias)}!`
                : successAction === 'break_start'
                  ? `Buen descanso, ${displayFirstName(resolved.firstName, resolved.alias)}`
                  : successAction === 'break_end'
                    ? `Bienvenido de nuevo, ${displayFirstName(resolved.firstName, resolved.alias)}`
                    : `¡Hola ${displayFirstName(resolved.firstName, resolved.alias)}!`}
            </h2>
            <p className="mt-3 text-center text-sm font-medium text-zinc-600">
              {successAction === 'clock_in'
                ? 'Hemos registrado tu llegada a las'
                : successAction === 'break_start'
                  ? 'Hemos registrado tu salida a descanso a las'
                  : successAction === 'break_end'
                    ? 'Hemos registrado tu vuelta de descanso a las'
                    : 'Hemos registrado tu salida final a las'}
            </p>
            <div className="mt-5 rounded-2xl bg-zinc-50 px-4 py-5 text-center ring-1 ring-zinc-200/90">
              <span className="text-5xl font-black tabular-nums text-zinc-900 sm:text-6xl">{successAt}</span>
            </div>
            {successPhrase ? (
              <p
                className={[
                  'mt-5 rounded-2xl px-4 py-3 text-center text-base font-semibold leading-snug sm:text-lg',
                  successAction === 'clock_in'
                    ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80'
                    : 'bg-amber-50 text-amber-950 ring-1 ring-amber-200/80',
                ].join(' ')}
              >
                {successPhrase}
              </p>
            ) : null}
            <button
              type="button"
              onClick={resetFlow}
              className={[
                'mt-8 min-h-[56px] w-full rounded-2xl text-lg font-extrabold text-white shadow-lg transition active:scale-[0.99]',
              successAction === 'clock_in'
                ? 'bg-emerald-500 shadow-emerald-900/30 hover:bg-emerald-400'
                : successAction === 'break_end'
                  ? 'bg-indigo-500 shadow-indigo-900/30 hover:bg-indigo-400'
                  : 'bg-amber-500 shadow-amber-900/35 hover:bg-amber-400',
              ].join(' ')}
            >
              Aceptar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
