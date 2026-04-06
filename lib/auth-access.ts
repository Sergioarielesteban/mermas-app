const ALLOWED_PHONES = [
  '+34622915421',
  '+34632389743',
  '+34602083078',
] as const;

function normalizePhone(phone: string) {
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
  const digits = cleaned.replace(/\D/g, '');
  // Conveniencia local: si escriben 9 dígitos, asumimos España (+34).
  if (digits.length === 9) return `+34${digits}`;
  return `+${digits}`;
}

export function getAllowedPhones() {
  return ALLOWED_PHONES.map(normalizePhone);
}

export function isAllowedPhone(phone: string) {
  const allowed = getAllowedPhones();
  if (allowed.length === 0) return true; // Si está vacío, permite cualquier teléfono.
  return allowed.includes(normalizePhone(phone));
}

export function isValidPhoneInput(phone: string) {
  const normalized = normalizePhone(phone);
  // E.164 básico: + y entre 8 y 15 dígitos
  return /^\+\d{8,15}$/.test(normalized);
}

export function normalizePhoneForAuth(phone: string) {
  return normalizePhone(phone);
}

