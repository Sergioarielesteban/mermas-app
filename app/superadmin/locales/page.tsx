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
type CreateForm = {
  localName: string;
  localCode: string;
  city: string;
  adminName: string;
  adminEmail: string;
  tempPassword: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
};
type CreateResult = {
  local: LocalDashboardItem;
  credentials: { adminEmail: string; tempPassword: string };
  summary: { localCreated: boolean; adminUserCreated: boolean; planAssigned: PlanCode };
};

const PLAN_OPTIONS: PlanCode[] = ['OPERATIVO', 'CONTROL', 'PRO'];
const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'inactive', 'canceled'];
const DEFAULT_CREATE_FORM: CreateForm = {
  localName: '',
  localCode: '',
  city: '',
  adminName: '',
  adminEmail: '',
  tempPassword: '',
  planCode: 'OPERATIVO',
  status: 'active',
};

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
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createNotice, setCreateNotice] = React.useState<string | null>(null);
  const [createForm, setCreateForm] = React.useState<CreateForm>(DEFAULT_CREATE_FORM);
  const [createResult, setCreateResult] = React.useState<CreateResult | null>(null);

  const readAccessToken = React.useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadLocals = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await readAccessToken();
    if (!token) {
      setError('No se pudo inicializar la sesión.');
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
  }, [readAccessToken]);

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
      const token = await readAccessToken();
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
    [patchLocalState, readAccessToken, stateByLocal],
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

  const updateCreateForm = React.useCallback(<K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const copyCredentials = React.useCallback(async () => {
    if (!createResult) return;
    const text = `Acceso Chef-One\nEmail: ${createResult.credentials.adminEmail}\nPassword temporal: ${createResult.credentials.tempPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCreateNotice('Credenciales copiadas.');
    } catch {
      setCreateError('No se pudo copiar automáticamente. Copia manualmente.');
    }
  }, [createResult]);

  const createLocalAndAccount = React.useCallback(async () => {
    setCreateError(null);
    setCreateNotice(null);
    setCreateResult(null);
    if (!createForm.localName.trim()) {
      setCreateError('Debes indicar el nombre del local.');
      return;
    }
    if (!createForm.adminName.trim()) {
      setCreateError('Debes indicar el nombre del responsable.');
      return;
    }
    if (!createForm.adminEmail.trim()) {
      setCreateError('Debes indicar el email del administrador.');
      return;
    }
    if (!createForm.tempPassword.trim()) {
      setCreateError('Debes indicar una contraseña temporal.');
      return;
    }

    setCreateBusy(true);
    const token = await readAccessToken();
    if (!token) {
      setCreateBusy(false);
      setCreateError('No se pudo obtener token de sesión.');
      return;
    }
    const res = await fetch('/api/superadmin/locals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        localName: createForm.localName,
        localCode: createForm.localCode,
        city: createForm.city,
        adminName: createForm.adminName,
        adminEmail: createForm.adminEmail,
        tempPassword: createForm.tempPassword,
        planCode: createForm.planCode,
        status: createForm.status,
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      details?: string[];
      local?: LocalDashboardItem;
      credentials?: { adminEmail: string; tempPassword: string };
      summary?: { localCreated: boolean; adminUserCreated: boolean; planAssigned: PlanCode };
    };
    setCreateBusy(false);
    if (!res.ok || payload.ok !== true || !payload.local || !payload.credentials || !payload.summary) {
      const details = Array.isArray(payload.details) && payload.details.length > 0 ? ` ${payload.details.join(' · ')}` : '';
      setCreateError((payload.error ?? 'No se pudo crear el local y la cuenta.') + details);
      return;
    }

    setCreateResult({
      local: payload.local,
      credentials: payload.credentials,
      summary: payload.summary,
    });
    setCreateForm(DEFAULT_CREATE_FORM);
    setCreateOpen(false);
    await loadLocals();
  }, [createForm, loadLocals, readAccessToken]);

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

      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => {
            setCreateOpen((prev) => !prev);
            setCreateError(null);
            setCreateNotice(null);
          }}
          className="w-full rounded-xl bg-[#D32F2F] px-4 py-3 text-sm font-extrabold text-white sm:w-auto"
        >
          + Nuevo local
        </button>
      </div>

      {createOpen ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-extrabold text-zinc-900">Alta rápida de cliente</h2>
          <p className="mt-1 text-xs text-zinc-600">Completa estos datos y deja la cuenta operativa en un solo paso.</p>

          <div className="mt-4 grid gap-3">
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Nombre del local *
              <input
                value={createForm.localName}
                onChange={(e) => updateCreateForm('localName', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="Chef-One Centro"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Código corto (opcional)
              <input
                value={createForm.localCode}
                onChange={(e) => updateCreateForm('localCode', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="CHEF-CENTRO"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Ciudad / zona (opcional)
              <input
                value={createForm.city}
                onChange={(e) => updateCreateForm('city', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="Madrid Centro"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Nombre responsable *
              <input
                value={createForm.adminName}
                onChange={(e) => updateCreateForm('adminName', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="Ana Torres"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Email administrador *
              <input
                type="email"
                value={createForm.adminEmail}
                onChange={(e) => updateCreateForm('adminEmail', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="admin@local.com"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Contraseña temporal *
              <input
                value={createForm.tempPassword}
                onChange={(e) => updateCreateForm('tempPassword', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
                placeholder="Temporal123!"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-zinc-600">
              Plan inicial
              <select
                value={createForm.planCode}
                onChange={(e) => updateCreateForm('planCode', e.target.value as PlanCode)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
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
                value={createForm.status}
                onChange={(e) => updateCreateForm('status', e.target.value as SubscriptionStatus)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void createLocalAndAccount()}
            disabled={createBusy}
            className="mt-4 w-full rounded-xl bg-[#D32F2F] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {createBusy ? 'Creando...' : 'Crear local y cuenta'}
          </button>
        </section>
      ) : null}

      {createResult ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-extrabold text-emerald-900">Local creado correctamente</p>
          <p className="mt-1 text-xs font-semibold text-emerald-900">Usuario administrador creado</p>
          <p className="mt-1 text-xs font-semibold text-emerald-900">Plan asignado: {createResult.summary.planAssigned}</p>
          <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs text-zinc-800">
            <p>
              Email admin: <span className="font-bold">{createResult.credentials.adminEmail}</span>
            </p>
            <p>
              Password temporal: <span className="font-bold">{createResult.credentials.tempPassword}</span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void enterLocal(createResult.local)}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white"
            >
              Entrar a este local
            </button>
            <button
              type="button"
              onClick={() => void copyCredentials()}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-800"
            >
              Copiar credenciales
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateResult(null);
                router.push('/superadmin/locales');
              }}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-zinc-800"
            >
              Volver al panel
            </button>
          </div>
        </section>
      ) : null}

      {createNotice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {createNotice}
        </div>
      ) : null}

      {error || createError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {error ?? createError}
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
