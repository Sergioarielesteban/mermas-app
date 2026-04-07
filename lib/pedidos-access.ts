function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

const MATARO_LOCAL_ID = '74cdaba5-b714-47e9-811d-8de14d531a20';
const MATARO_ALLOWED_EMAILS = new Set(['xampacocina2026@gmail.com']);

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
    MATARO_ALLOWED_EMAILS.has(mail) ||
    id === MATARO_LOCAL_ID ||
    code === 'MATARO' ||
    name === 'MATARO' ||
    name.endsWith(' MATARO')
  );
}

