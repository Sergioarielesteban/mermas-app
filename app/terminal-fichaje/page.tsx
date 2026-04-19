'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, RefreshCw, Settings } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  findShiftForToday,
  getClockSessionState,
  sortEntriesByTime,
  todayYmd,
} from '@/lib/staff/attendance-logic';
import { entriesByEmployee } from '@/lib/staff/staff-heuristics';
import {
  fetchShiftsRange,
  fetchTimeEntriesRange,
  recordStaffTimeEvent,
  staffDisplayName,
  staffKioskResolveByPin,
} from '@/lib/staff/staff-supabase';
import { getSupabaseClient } from '@/lib/supabase-client';
import { pickTerminalPhrase, terminalSuccessEmoji } from '@/lib/staff/terminal-fichaje-phrases';
import type { StaffTimeEventType } from '@/lib/staff/types';

function TerminalLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-chef-one.svg"
      alt="Chef-One"
      width={512}
      height={512}
      className={[
        'h-auto w-full max-w-[7.5rem] object-contain drop-shadow-sm sm:max-w-[9rem]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

type Step = 'home' | 'pin' | 'success';

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

export default function TerminalFichajePage() {
  const { localId, localName, profileReady, profileRole } = useAuth();
  const perms = useMemo(() => buildStaffPermissions(profileRole), [profileRole]);
  const supabase = getSupabaseClient();

  const [now, setNow] = useState(() => new Date());
  const [step, setStep] = useState<Step>('home');
  const [pendingAction, setPendingAction] = useState<'clock_in' | 'clock_out' | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [successAt, setSuccessAt] = useState<string | null>(null);
  const [successAction, setSuccessAction] = useState<'clock_in' | 'clock_out' | null>(null);
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
      const start = new Date(`${ymd}T00:00:00`);
      const end = new Date(`${ymd}T23:59:59.999`);
      const [entries, shifts] = await Promise.all([
        fetchTimeEntriesRange(supabase, localId, start.toISOString(), end.toISOString()),
        fetchShiftsRange(supabase, localId, ymd, ymd),
      ]);
      const dayEntries = sortEntriesByTime(entriesByEmployee(entries, r.employeeId, ymd));
      const session = getClockSessionState(dayEntries);
      const want: StaffTimeEventType = pendingAction;
      if (!session.availableActions.includes(want)) {
        const hint =
          want === 'clock_in'
            ? 'No puedes fichar entrada ahora (¿ya entraste o falta cerrar jornada?).'
            : 'No puedes fichar salida ahora (¿falta la entrada?).';
        setBanner(hint);
        setPin('');
        return;
      }

      const planned = findShiftForToday(shifts, r.employeeId, ymd);
      await recordStaffTimeEvent(supabase, {
        employeeId: r.employeeId,
        eventType: want,
        shiftId: planned?.id ?? null,
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
      setSuccessPhrase(pickTerminalPhrase(want));
      setSuccessEmoji(terminalSuccessEmoji(want));
      setStep('success');
      setPin('');
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Error al fichar');
      setPin('');
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
        <Link
          href="/panel"
          className="rounded-2xl bg-zinc-900 px-6 py-3 text-sm font-extrabold text-white"
        >
          Volver
        </Link>
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
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <TerminalLogo className="!max-w-[5.25rem] shrink-0 sm:!max-w-[6.5rem]" />
              <div className="min-w-0 text-left">
                <p className="truncate font-serif text-lg font-bold text-zinc-900 sm:text-xl">
                  {localName ?? 'Local'}
                </p>
                <p className="text-sm font-medium capitalize text-zinc-500">{dateLabel}</p>
              </div>
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
            <button
              type="button"
              onClick={resetFlow}
              className="mb-6 text-sm font-bold text-zinc-500 hover:text-zinc-900"
            >
              ← Volver
            </button>
            <div className="relative mb-6">
              <div className="absolute -inset-6 rounded-full border border-zinc-200/80 bg-zinc-50/80" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-[#ffffff] ring-2 ring-amber-400/55 shadow-sm">
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
            <div className="mt-12 flex w-full flex-col items-center">
              <TerminalLogo className="mx-auto !max-w-[7rem] sm:!max-w-[8.5rem]" />
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
              <TerminalLogo className="!max-w-[5.5rem] sm:!max-w-[6.5rem]" />
            </div>
            <div className="mt-4 text-center text-5xl leading-none">{successEmoji ?? '✨'}</div>
            <h2 className="mt-3 text-center text-2xl font-extrabold text-zinc-900 sm:text-3xl">
              ¡Hola {displayFirstName(resolved.firstName, resolved.alias)}!
            </h2>
            <p className="mt-3 text-center text-sm font-medium text-zinc-600">
              {successAction === 'clock_in'
                ? 'Hemos registrado tu llegada a las'
                : 'Hemos registrado tu salida a las'}
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
