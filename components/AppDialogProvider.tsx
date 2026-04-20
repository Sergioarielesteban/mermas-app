'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setAppDialogBridge, type AppDialogBridge } from '@/lib/app-dialog-bridge';

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<{ message: string } | null>(null);
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);

  const [alertOpen, setAlertOpen] = useState<{ message: string } | null>(null);
  const alertResolveRef = useRef<(() => void) | null>(null);

  const [promptOpen, setPromptOpen] = useState<{ message: string; defaultValue: string } | null>(null);
  const promptResolveRef = useRef<((v: string | null) => void) | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const promptInputRef = useRef<HTMLInputElement>(null);

  const closeConfirm = useCallback((value: boolean) => {
    confirmResolveRef.current?.(value);
    confirmResolveRef.current = null;
    setConfirmOpen(null);
  }, []);

  const closeAlert = useCallback(() => {
    alertResolveRef.current?.();
    alertResolveRef.current = null;
    setAlertOpen(null);
  }, []);

  const closePrompt = useCallback((value: string | null) => {
    promptResolveRef.current?.(value);
    promptResolveRef.current = null;
    setPromptOpen(null);
    setPromptValue('');
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!promptOpen) return;
    setPromptValue(promptOpen.defaultValue);
    const t = window.setTimeout(() => promptInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [promptOpen]);

  useEffect(() => {
    const bridge: AppDialogBridge = {
      confirm: (message) =>
        new Promise((resolve) => {
          confirmResolveRef.current = resolve;
          setConfirmOpen({ message });
        }),
      alert: (message) =>
        new Promise((resolve) => {
          alertResolveRef.current = resolve;
          setAlertOpen({ message });
        }),
      prompt: (message, defaultValue = '') =>
        new Promise((resolve) => {
          promptResolveRef.current = resolve;
          setPromptOpen({ message, defaultValue });
        }),
    };
    setAppDialogBridge(bridge);
    return () => setAppDialogBridge(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmOpen) closeConfirm(false);
      else if (promptOpen) closePrompt(null);
      else if (alertOpen) closeAlert();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen, promptOpen, alertOpen, closeConfirm, closePrompt, closeAlert]);

  const overlay = (inner: React.ReactNode) => (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/45 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (confirmOpen) closeConfirm(false);
          if (promptOpen) closePrompt(null);
          if (alertOpen) closeAlert();
        }
      }}
    >
      {inner}
    </div>
  );

  const cardClass =
    'w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xl shadow-zinc-900/20 ring-1 ring-zinc-100';

  const modals =
    confirmOpen != null
      ? overlay(
          <div className={cardClass} role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title">
            <p id="app-confirm-title" className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
              Confirmación
            </p>
            <p className="mt-2 text-base font-semibold leading-snug text-zinc-800">{confirmOpen.message}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
                onClick={() => closeConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm"
                onClick={() => closeConfirm(true)}
              >
                Aceptar
              </button>
            </div>
          </div>,
        )
      : alertOpen != null
        ? overlay(
            <div className={cardClass} role="alertdialog" aria-modal="true" aria-labelledby="app-alert-title">
              <p id="app-alert-title" className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                Aviso
              </p>
              <p className="mt-2 text-base font-semibold leading-snug text-zinc-800 whitespace-pre-wrap">
                {alertOpen.message}
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="h-11 rounded-xl bg-[#D32F2F] px-5 text-sm font-black uppercase tracking-wide text-white shadow-sm"
                  onClick={closeAlert}
                >
                  Entendido
                </button>
              </div>
            </div>,
          )
        : promptOpen != null
          ? overlay(
              <div className={cardClass} role="dialog" aria-modal="true" aria-labelledby="app-prompt-label">
                <p id="app-prompt-label" className="text-sm font-bold text-zinc-800">
                  {promptOpen.message}
                </p>
                <input
                  ref={promptInputRef}
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      closePrompt(promptValue.trim() === '' ? '' : promptValue);
                    }
                  }}
                  className="mt-3 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-base font-semibold text-zinc-900 outline-none focus:border-[#D32F2F]/50 focus:bg-white focus:ring-2 focus:ring-[#D32F2F]/15"
                  autoComplete="off"
                />
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800"
                    onClick={() => closePrompt(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-xl bg-[#D32F2F] px-4 text-sm font-black uppercase tracking-wide text-white shadow-sm"
                    onClick={() => closePrompt(promptValue)}
                  >
                    Guardar
                  </button>
                </div>
              </div>,
            )
          : null;

  return (
    <>
      {children}
      {mounted && modals != null ? createPortal(modals, document.body) : null}
    </>
  );
}
