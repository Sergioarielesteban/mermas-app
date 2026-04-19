'use client';

import Link from 'next/link';
import React from 'react';
import { useRouter } from 'next/navigation';
import MermasStyleHero from '@/components/MermasStyleHero';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { PlanCode } from '@/lib/planPermissions';
import type { SubscriptionStatus } from '@/lib/subscriptions-supabase';

type LocalDashboardItem = {
  localId: string;
  localCode: string | null;
  localName: string | null;
  isCentralKitchen: boolean;
  planCode: PlanCode;
  status: SubscriptionStatus;
  startsAt: string | null;
};

type SaveState = Record<string, { planCode: PlanCode; status: SubscriptionStatus; saving: boolean; message: string | null }>;

const PLAN_OPTIONS: PlanCode[] = ['OPERATIVO', 'CONTROL', 'PRO'];
const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'inactive', 'canceled'];

function fmtDate(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function SuperadminLocalesPage() {
  const router = useRouter();
  const { profileReady, isSuperadmin, enterSuperadminLocal } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [locals, setLocals] = React.useState<LocalDashboardItem[]>([]);
  const [stateByLocal, setStateByLocal] = React.useState<SaveState>({});

  const loadLocals = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('No se pudo inicializar la sesión.');
      setLoading(false);
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError('Sesión no disponible.');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/superadmin/locals', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      locals?: LocalDashboardItem[];
    };
    if (!res.ok || payload.ok !== true || !Array.isArray(payload.locals)) {
      setError(payload.error ?? 'No se pudo cargar el listado global de locales.');
      setLoading(false);
      return;
    }
    setLocals(payload.locals);
    setStateByLocal(
      Object.fromEntries(
        payload.locals.map((item) => [
          item.localId,
          { planCode: item.planCode, status: item.status, saving: false, message: null },
        ]),
      ),
    );
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!profileReady) return;
    if (!isSuperadmin) {
      router.replace('/panel');
      return;
    }
    void loadLocals();
  }, [isSuperadmin, loadLocals, profileReady, router]);

  const patchLocalState = React.useCallback((localId: string, patch: Partial<SaveState[string]>) => {
    setStateByLocal((prev) => {
      const base = prev[localId];
      if (!base) return prev;
      return { ...prev, [localId]: { ...base, ...patch } };
    });
  }, []);

  const saveLocal = React.useCallback(
    async (item: LocalDashboardItem) => {
      const current = stateByLocal[item.localId];
      if (!current) return;
      patchLocalState(item.localId, { saving: true, message: null });
      const supabase = getSupabaseClient();
      if (!supabase) {
        patchLocalState(item.localId, { saving: false, message: 'Sesión no disponible.' });
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        patchLocalState(item.localId, { saving: false, message: 'Token no disponible.' });
        return;
      }
      const res = await fetch(`/api/superadmin/locals/${encodeURIComponent(item.localId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planCode: current.planCode, status: current.status }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        subscription?: { planCode?: PlanCode; status?: SubscriptionStatus };
      };
      if (!res.ok || payload.ok !== true) {
        patchLocalState(item.localId, {
          saving: false,
          message: payload.error ?? 'No se pudo guardar.',
        });
        return;
      }
      const nextPlan = payload.subscription?.planCode ?? current.planCode;
      const nextStatus = payload.subscription?.status ?? current.status;
      patchLocalState(item.localId, {
        planCode: nextPlan,
        status: nextStatus,
        saving: false,
        message: 'Cambios guardados.',
      });
      setLocals((prev) =>
        prev.map((x) => (x.localId === item.localId ? { ...x, planCode: nextPlan, status: nextStatus } : x)),
      );
    },
    [patchLocalState, stateByLocal],
  );

  const enterLocal = React.useCallback(
    async (item: LocalDashboardItem) => {
      const res = await enterSuperadminLocal({
        localId: item.localId,
        localCode: item.localCode,
        localName: item.localName,
        isCentralKitchen: item.isCentralKitchen,
      });
      if (!res.ok) {
        patchLocalState(item.localId, { message: res.reason ?? 'No se pudo entrar al local.' });
        return;
      }
      router.push('/panel');
    },
    [enterSuperadminLocal, patchLocalState, router],
  );

  if (!profileReady) {
    return <p className="py-8 text-center text-sm text-zinc-500">Cargando acceso superadmin...</p>;
  }
  if (!isSuperadmin) return null;

  return (
    <div className="space-y-5">
      <MermasStyleHero
        eyebrow="Superadmin"
        title="Panel global de locales"
        tagline="Gestion centralizada de planes, estados y acceso por local"
        compact
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-zinc-600">Cargando locales...</p> : null}

      {!loading && locals.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
          No hay locales disponibles.
        </p>
      ) : null}

      <div className="space-y-3">
        {locals.map((item) => {
          const localState = stateByLocal[item.localId];
          const planCode = localState?.planCode ?? item.planCode;
          const status = localState?.status ?? item.status;
          const saving = !!localState?.saving;
          return (
            <article key={item.localId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-zinc-900">{item.localName ?? item.localCode ?? item.localId}</h2>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {item.localCode ?? 'SIN-CODIGO'} · inicio: {fmtDate(item.startsAt)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-700">
                  {item.isCentralKitchen ? 'Central' : 'Local'}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
                  Plan
                  <select
                    value={planCode}
                    onChange={(e) => patchLocalState(item.localId, { planCode: e.target.value as PlanCode, message: null })}
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {PLAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
                  Estado
                  <select
                    value={status}
                    onChange={(e) =>
                      patchLocalState(item.localId, { status: e.target.value as SubscriptionStatus, message: null })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveLocal(item)}
                  disabled={saving}
                  className="rounded-xl bg-[#D32F2F] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => void enterLocal(item)}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-800"
                >
                  Entrar a este local
                </button>
              </div>

              {localState?.message ? <p className="mt-2 text-xs font-semibold text-zinc-600">{localState.message}</p> : null}
            </article>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Link
          href="/panel"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
        >
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
