export function uid(prefix = '') {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}_${rnd}` : rnd;
}

