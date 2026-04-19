export function parseEmailCsvToSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailInAllowlist(email: string | null | undefined, csv: string): boolean {
  if (!email) return false;
  if (!csv.trim()) return false;
  return parseEmailCsvToSet(csv).has(email.trim().toLowerCase());
}
