'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  getConfiguredCocinaCentralModulePin,
  isCocinaCentralModuleUnlockedInSession,
  tryCocinaCentralModulePin,
  setCocinaCentralModuleUnlockedInSession,
} from '@/lib/cocina-central-module-pin';

type Props = {
  children: React.ReactNode;
};

export function CocinaCentralModulePinGate({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const pinRequired = getConfiguredCocinaCentralModulePin() != null;

  useEffect(() => {
    if (!pinRequired) {
      setUnlocked(true);
      setReady(true);
      return;
    }
    setUnlocked(isCocinaCentralModuleUnlockedInSession());
    setReady(true);
  }, [pinRequired]);

  const submit = useCallback(() => {
    setErr(null);
    if (tryCocinaCentralModulePin(digits)) {
      setUnlocked(true);
      setDigits('');
    } else {
      setErr('Clave incorrecta.');
    }
  }, [digits]);

  if (!ready) {
    return <p className="text-center text-sm text-zinc-500">Cargando…</p>;
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col justify-center space-y-4 px-1 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-5 shadow-sm">
          <h1 className="text-lg font-extrabold text-zinc-900">Cocina central</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Introduce la clave de 4 dígitos del módulo para continuar. La sesión del navegador se mantiene hasta que cierres la pestaña o pulses «Salir del módulo».
          </p>
          <div className="mt-4">
            <label className="text-xs font-bold uppercase text-zinc-500">Clave</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-3 text-center text-2xl font-mono font-bold tracking-widest"
              value={digits}
              onChange={(e) => {
                setDigits(e.target.value.replace(/\D/g, '').slice(0, 4));
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && digits.length === 4) void submit();
              }}
              autoFocus
            />
          </div>
          {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
          <button
            type="button"
            disabled={digits.length !== 4}
            onClick={() => void submit()}
            className="mt-4 h-12 w-full rounded-xl bg-[#D32F2F] text-sm font-extrabold text-white disabled:opacity-50"
          >
            Entrar
          </button>
        </div>
        <p className="text-center text-xs text-zinc-500">
          Clave en configuración: <code className="text-xs">NEXT_PUBLIC_COCINA_CENTRAL_MODULE_PIN</code> (4 dígitos). Sin esta variable, no se pide clave.
        </p>
      </div>
    );
  }

  return (
    <div>
      {pinRequired ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setCocinaCentralModuleUnlockedInSession(false);
              setUnlocked(false);
              setDigits('');
            }}
            className="text-xs font-bold text-zinc-600 underline"
          >
            Salir del módulo
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
