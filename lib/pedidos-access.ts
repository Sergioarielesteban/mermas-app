function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

const MATARO_LOCAL_ID = '74cdaba5-b714-47e9-811d-8de14d531a20';
const PREMIA_LOCAL_ID = '8e4f5bc5-2f22-4ce4-bf6f-8a66f2f7f66f';
/** Cuentas con acceso pedidos Mataró (direcciones en Auth; marca app: Chef-One). */
const PEDIDOS_ALLOWED_EMAILS = new Set(['xampacocina2026@gmail.com', 'xampapremia@gmail.com']);

/** Local o cuenta identificada como Premià (módulo pedidos deshabilitado; siguen viendo el acceso en menú). */
export function isPremiaPedidosLocked(
  localCode: string | null | undefined,
  email?: string | null,
  localName?: string | null,
  localId?: string | null,
) {
  const mail = (email ?? '').trim().toLowerCase();
  if (mail === 'xampapremia@gmail.com') return true;
  const code = normalize(localCode);
  const name = normalize(localName);
  const id = (localId ?? '').trim();
  return id === PREMIA_LOCAL_ID || code === 'PREMIA' || name === 'PREMIA' || name.endsWith(' PREMIA');
}

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
    name.endsWith(' MATARO')
    || name.endsWith(' PREMIA')
  );
}

/** Uso real del módulo (Premià ve el botón pero no entra al flujo). */
export function canUsePedidosModule(
  localCode: string | null | undefined,
  email?: string | null,
  localName?: string | null,
  localId?: string | null,
) {
  return canAccessPedidos(localCode, email, localName, localId) && !isPremiaPedidosLocked(localCode, email, localName, localId);
}

