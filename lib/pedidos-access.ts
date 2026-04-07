const MATARO_EMAILS = ['xampacocina2026@gmail.com', 'sergioarielesteban@hotmail.com'];

export function canAccessPedidos(localCode: string | null | undefined, email?: string | null) {
  const byLocal = (localCode ?? '').toUpperCase() === 'MATARO';
  const byEmail = MATARO_EMAILS.includes((email ?? '').trim().toLowerCase());
  return byLocal || byEmail;
}

