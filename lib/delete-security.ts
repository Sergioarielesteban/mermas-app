const DEFAULT_DELETE_PIN = '1234';

/** Clave guardada en el dispositivo; si no existe, se usa env o valor por defecto. */
export const DELETE_SECURITY_PIN_STORAGE_KEY = 'chef_one_delete_pin';

export const DELETE_BLOCKED_MERMAS = 'Por seguridad, no se permite borrar registros de mermas.';
export const DELETE_BLOCKED_PEDIDOS = 'Por seguridad, no se permite borrar registros de pedidos.';
export const DELETE_BLOCKED_INVENTARIO = 'Por seguridad, no se permite borrar registros de inventario.';

export function normalizeOpsSecurityPin(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/**
 * Clave de 4 dígitos para borrados y zonas restringidas (localStorage, env o "1234").
 */
export function getDeleteSecurityPinNormalized(): string {
  try {
    if (typeof window !== 'undefined') {
      const configured =
        (window.localStorage.getItem(DELETE_SECURITY_PIN_STORAGE_KEY) ?? '').trim() ||
        process.env.NEXT_PUBLIC_DELETE_SECURITY_PIN ||
        DEFAULT_DELETE_PIN;
      return normalizeOpsSecurityPin(configured);
    }
  } catch {
    // ignore
  }
  return normalizeOpsSecurityPin(
    String(process.env.NEXT_PUBLIC_DELETE_SECURITY_PIN ?? DEFAULT_DELETE_PIN),
  );
}

/** Persiste la clave de operaciones en este dispositivo (4 dígitos). */
export function setDeleteSecurityPinOnDevice(pin: string): void {
  if (typeof window === 'undefined') return;
  const n = normalizeOpsSecurityPin(pin);
  if (n.length !== 4) return;
  window.localStorage.setItem(DELETE_SECURITY_PIN_STORAGE_KEY, n);
}

/** Quita la clave personalizada del dispositivo (vuelve a env o 1234). */
export function clearDeleteSecurityPinOnDevice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DELETE_SECURITY_PIN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasDeleteSecurityPinDeviceOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = (window.localStorage.getItem(DELETE_SECURITY_PIN_STORAGE_KEY) ?? '').trim();
    return normalizeOpsSecurityPin(v).length === 4;
  } catch {
    return false;
  }
}

export function requestDeleteSecurityPin(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);
  const expected = getDeleteSecurityPinNormalized();
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[120] grid place-items-center bg-black/40 px-4';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl ring-1 ring-zinc-100';
    card.innerHTML = `
      <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D32F2F]">Seguridad</p>
      <h3 class="mt-2 text-lg font-extrabold tracking-tight text-zinc-900">Ingresa tu clave de seguridad</h3>
      <p class="mt-1 text-sm text-zinc-600">Clave de 4 dígitos para confirmar el borrado.</p>
      <span class="mt-4 block h-[2px] w-24 rounded-full bg-[#D32F2F]/75"></span>
    `;

    const input = document.createElement('input');
    input.type = 'password';
    input.inputMode = 'numeric';
    input.maxLength = 4;
    input.placeholder = '••••';
    input.className =
      'mt-4 h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-center text-lg font-bold tracking-[0.45em] text-zinc-900 outline-none focus:border-[#D32F2F] focus:ring-2 focus:ring-[#D32F2F]/20';

    const error = document.createElement('p');
    error.className = 'mt-2 min-h-5 text-center text-xs font-semibold text-red-600';

    const actions = document.createElement('div');
    actions.className = 'mt-4 flex gap-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className =
      'h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700';
    cancelBtn.textContent = 'Cancelar';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'h-11 flex-1 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white';
    okBtn.textContent = 'Validar';

    actions.append(cancelBtn, okBtn);
    card.append(input, error, actions);
    overlay.append(card);
    document.body.appendChild(overlay);
    input.focus();

    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve(result);
    };

    cancelBtn.onclick = () => finish(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) finish(false);
    };
    const validate = () => {
      const pin = input.value.trim();
      if (pin === expected) {
        finish(true);
        return;
      }
      error.textContent = 'Clave incorrecta.';
      input.select();
    };
    okBtn.onclick = validate;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        validate();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
  });
}
