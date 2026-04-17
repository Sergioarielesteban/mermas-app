function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

const MATARO_LOCAL_ID = '74cdaba5-b714-47e9-811d-8de14d531a20';
const PREMIA_LOCAL_ID = '8e4f5bc5-2f22-4ce4-bf6f-8a66f2f7f66f';
/** Cuentas con acceso pedidos (Chef-One). */
const PEDIDOS_ALLOWED_EMAILS = new Set(['xampacocina2026@gmail.com', 'xampapremia@gmail.com']);

export function canAccessPedidos(
  localCode: string | null | undefined,
  email?: string | null,
  localName?: string | null,
  localId?: string | null,
) {
  const mail = (email ?? '').trim().toLowerCase();
  const code = normalize(localCode);
  const name = normalize(localName);
  const id = (localId ?? '').trim();
  return (
    PEDIDOS_ALLOWED_EMAILS.has(mail) ||
    id === MATARO_LOCAL_ID ||
    id === PREMIA_LOCAL_ID ||
    code === 'MATARO' ||
    code === 'PREMIA' ||
    name === 'MATARO' ||
    name === 'PREMIA' ||
    name.endsWith(' MATARO') ||
    name.endsWith(' PREMIA')
  );
}

/** Mismo criterio que `canAccessPedidos` (Mataró y Premià operativos). */
export function canUsePedidosModule(
  localCode: string | null | undefined,
  email?: string | null,
  localName?: string | null,
  localId?: string | null,
) {
  return canAccessPedidos(localCode, email, localName, localId);
}
