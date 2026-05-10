/** Saludo del panel / home operativa — usado en AppShell y opcionalmente en tests. */

const GOOD_VIBES = ['👋', '💪', '🙌', '✨', '🤜', '🫶', '😊', '🚀', '🔥', '🤩', '👊', '🎯'];

export function getDailyEmoji(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return GOOD_VIBES[dayOfYear % GOOD_VIBES.length]!;
}

export function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Buenos días';
  if (hour >= 14 && hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function shortNameForGreeting(
  displayName: string | null,
  loginUsername: string | null,
  email: string | null,
): string | null {
  const dn = displayName?.trim();
  if (dn) {
    const first = dn.split(/\s+/)[0]!;
    return first.length ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : null;
  }
  const lu = loginUsername?.trim();
  if (lu) {
    return lu.charAt(0).toUpperCase() + lu.slice(1).toLowerCase();
  }
  const local = email?.split('@')[0]?.trim();
  if (local) {
    const seg = local.split(/[._-]/)[0] ?? local;
    if (seg.length) return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
  }
  return null;
}

export function buildPanelGreetingParts(
  displayName: string | null,
  loginUsername: string | null,
  email: string | null,
): { text: string; emoji: string } {
  const greeting = getTimeOfDayGreeting();
  const who = shortNameForGreeting(displayName, loginUsername, email);
  const emoji = getDailyEmoji();
  const text = who ? `${greeting}, ${who}` : greeting;
  return { text, emoji };
}
