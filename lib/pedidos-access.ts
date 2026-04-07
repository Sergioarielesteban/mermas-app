function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

const MATARO_LOCAL_ID = '74cdaba5-b714-47e9-811d-8de14d531a20';

export function canAccessPedidos(
  localCode: string | null | undefined,
  email?: string | null,
  localName?: string | null,
  localId?: string | null,
) {
  void email;
  const code = normalize(localCode);
  const name = normalize(localName);
  const id = (localId ?? '').trim();
  return id === MATARO_LOCAL_ID || code === 'MATARO' || name === 'MATARO' || name.endsWith(' MATARO');
}

