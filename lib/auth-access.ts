const ALLOWED_EMAILS = [
  'sergioarielesteban@hotmail.com',
  'xampacocina2026@gmail.com',
] as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getAllowedEmails() {
  return ALLOWED_EMAILS.map(normalizeEmail);
}

export function isAllowedEmail(email: string) {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return true; // Mientras esté vacío, permite cualquier email.
  return allowed.includes(normalizeEmail(email));
}

