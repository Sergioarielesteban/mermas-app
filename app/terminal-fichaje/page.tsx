'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, RefreshCw, Settings } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { buildStaffPermissions } from '@/lib/staff/permissions';
import {
  findShiftForToday,
  getClockSessionState,
  todayYmd,
} from '@/lib/staff/attendance-logic';
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
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function displayFirstName(first: string, alias: string | null): string {
  return alias?.trim() || first.trim() || 'compañero';
}

export default function TerminalFichajePage() {
  const router = useRouter();
  const { localId, localName, profileReady, profileRole } = useAuth();

  const perms = useMemo(
    () => buildStaffPermissions(profileRole),
    [profileRole]
  );

  const supabase = getSupabaseClient();

  const [step, setStep] = useState<Step>('home');
  const [pendingAction, setPendingAction] = useState<
    'clock_in' | 'clock_out' | null
  >(null);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [resolved, setResolved] = useState<any>(null);
  const [successAt, setSuccessAt] = useState<string | null>(null);
  const [successAction, setSuccessAction] =
    useState<StaffTimeEventType | null>(null);

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [now]
  );

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now]
  );

  const resetFlow = useCallback(() => {
    setStep('home');
    setPendingAction(null);
    setPin('');
    setBanner(null);
    setResolved(null);
    setSuccessAt(null);
    setSuccessAction(null);
  }, []);

  const goPin = (action: 'clock_in' | 'clock_out') => {
    setPendingAction(action);
    setStep('pin');
    setPin('');
    setBanner(null);
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
        setBanner('PIN incorrecto');
        setPin('');
        return;
      }

      const ymd = todayYmd();

      const [recentEntries, shifts] = await Promise.all([
        fetchRecentStaffTimeEntriesForEmployee(
          supabase,
          localId,
          r.employeeId,
          48
        ),
        fetchShiftsRange(supabase, localId, ymd, ymd),
      ]);

      const session = getClockSessionState(recentEntries);

      if (!session.availableActions.includes(pendingAction)) {
        setBanner('Acción no disponible');
        setPin('');
        return;
      }

      const planned = findShiftForToday(shifts, r.employeeId, ymd);

      await recordStaffTimeEvent(supabase, {
        employeeId: r.employeeId,
        eventType: pendingAction,
        shiftId: planned?.id ?? null,
        pin: fullPin,
        origin: 'device',
      });

      setResolved({
        employeeId: r.employeeId,
        firstName: r.firstName,
        lastName: r.lastName,
        alias: r.alias,
      });

      setSuccessAction(pendingAction);

      setSuccessAt(
        new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );

      setStep('success');
      setPin('');
    } catch (e) {
      setBanner('Error al fichar');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Cargando...
      </div>
    );
  }

  if (!localId || !supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Sin conexión
      </div>
    );
  }

  if (!perms.canOperateAttendanceTerminal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
        <p className="text-2xl font-black text-zinc-900">
          Acceso restringido
        </p>

        <button
          type="button"
          onClick={() => goBackOrToPanel(router)}
          className="rounded-2xl bg-zinc-900 px-6 py-3 text-white"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8f6f4] text-zinc-950">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <div className="w-14" />

        <Logo variant="inline" className="!h-9 sm:!h-10" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            <RefreshCw className="h-5 w-5 text-zinc-700" />
          </button>

          <Link
            href="/personal/fichaje"
            className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            <Settings className="h-5 w-5 text-zinc-700" />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-8">
        {step === 'home' && (
          <section className="w-full max-w-5xl rounded-[36px] border border-zinc-100 bg-white px-5 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-10 sm:py-10 lg:px-16">
            <h1 className="font-serif text-5xl font-semibold tracking-tight text-[#D71920] sm:text-6xl md:text-7xl">
              Chef One
            </h1>

            <p className="mt-4 text-lg font-extrabold text-zinc-950 sm:text-xl">
              ¡Hola, bienvenido/a! 👋
            </p>

            <p className="mt-1 text-sm font-semibold capitalize text-zinc-400 sm:text-base">
              {dateLabel}
            </p>

            <div className="mt-6 text-[76px] font-black leading-none tracking-[-0.07em] text-zinc-950 sm:text-[118px] md:text-[140px]">
              {timeLabel}
            </div>

            <p className="mt-2 text-xs font-bold text-zinc-400">
              {localName ?? 'Local'}
            </p>

            <p className="mx-auto mt-6 max-w-md text-base font-medium leading-relaxed text-zinc-500 sm:text-lg">
              <span className="px-2 text-2xl font-black text-[#D71920]">
                “
              </span>
              Cada día es una nueva oportunidad para ser mejor que ayer.
              <span className="px-2 text-2xl font-black text-[#D71920]">
                ”
              </span>
            </p>

            <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => goPin('clock_in')}
                className="flex min-h-[68px] items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-5 text-base font-black uppercase tracking-wide text-[#D71920] shadow-sm transition hover:bg-zinc-50 active:scale-[0.99]"
              >
                <span className="text-3xl">↪</span>
                LLEGADA
              </button>

              <button
                type="button"
                onClick={() => goPin('clock_out')}
                className="flex min-h-[68px] items-center justify-center gap-3 rounded-2xl bg-[#D71920] px-5 text-base font-black uppercase tracking-wide text-white shadow-[0_14px_34px_rgba(215,25,32,0.22)] transition hover:bg-[#b9151b] active:scale-[0.99]"
              >
                <span className="text-3xl">↩</span>
                SALIDA
              </button>
            </div>

            <p className="mt-7 text-sm font-medium text-zinc-500">
              Gracias por tu compromiso ❤️
            </p>

            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
              Modo terminal · sesión de encargado
            </p>
          </section>
        )}

        {step === 'pin' && (
          <section className="w-full max-w-md rounded-[34px] border border-zinc-100 bg-white px-5 py-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-8">
            <button
              type="button"
              onClick={resetFlow}
              className="mb-5 text-sm font-bold text-zinc-400"
            >
              Cancelar
            </button>

            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-200">
              <Lock className="h-9 w-9 text-[#D71920]" />
            </div>

            <p className="mt-5 text-xl font-extrabold text-zinc-950">
              Introduce tu código PIN
            </p>

            <div className="mt-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={[
                    'h-3 w-3 rounded-full border border-zinc-300',
                    pin.length > i
                      ? 'border-[#D71920] bg-[#D71920]'
                      : '',
                  ].join(' ')}
                />
              ))}
            </div>

            {banner && (
              <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {banner}
              </p>
            )}

            <div className="mt-8 grid grid-cols-3 justify-items-center gap-x-5 gap-y-4 text-3xl font-bold text-zinc-950">
              {['1','2','3','4','5','6','7','8','9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => appendDigit(n)}
                  className="grid h-16 w-16 place-items-center rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200"
                >
                  {n}
                </button>
              ))}

              <div />

              <button
                type="button"
                disabled={busy}
                onClick={() => appendDigit('0')}
                className="grid h-16 w-16 place-items-center rounded-2xl transition hover:bg-zinc-100 active:bg-zinc-200"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="h-16 text-sm font-extrabold uppercase tracking-wide text-zinc-400"
              >
                Borrar
              </button>
            </div>
          </section>
        )}

        {step === 'success' && resolved && successAt && (
          <section className="w-full max-w-md rounded-[34px] border border-zinc-100 bg-white px-5 py-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-8">
            <div className="text-5xl">
              {successAction === 'clock_in' ? '👋' : '🫡'}
            </div>

            <h2 className="mt-4 text-2xl font-black text-zinc-950 sm:text-3xl">
              {successAction === 'clock_in'
                ? `¡Hola ${displayFirstName(
                    resolved.firstName,
                    resolved.alias
                  )}!`
                : `¡Adiós ${displayFirstName(
                    resolved.firstName,
                    resolved.alias
                  )}!`}
            </h2>

            <p className="mt-3 text-sm font-medium text-zinc-500">
              Registro completado a las
            </p>

            <div className="mt-5 rounded-3xl bg-zinc-50 px-4 py-5 text-center ring-1 ring-zinc-200">
              <span className="text-5xl font-black tracking-[-0.05em] text-zinc-950 sm:text-6xl">
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
        )}
      </main>
    </div>
  );
}