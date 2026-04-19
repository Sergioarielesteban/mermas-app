/**
 * Formulario público landing: honeypot, rate limit por IP, validación estricta.
 */
import { NextResponse } from 'next/server';
import { sendLeadNotificationEmail } from '@/lib/server/notify-lead-email';
import { insertMarketingLead, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { readJsonBodyLimitedEx } from '@/lib/server/read-json-limited';
import { enforceRateLimitPublic } from '@/lib/server/security-rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;
const MAX_RESTAURANT = 200;
const MAX_MESSAGE = 4000;
const MAX_BODY_BYTES = 48_000;
const PHONE_SAFE_RE = /^[\d\s+().\-]{0,40}$/;

function clip(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string';
}

export async function POST(request: Request) {
  const limited = enforceRateLimitPublic(request, 'leads');
  if (limited) return limited;

  const parsed = await readJsonBodyLimitedEx(request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: 'Request failed' },
      { status: parsed.kind === 'too_large' ? 413 : 400 },
    );
  }
  const body = parsed.data;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;

  if (typeof rec._hp === 'string' && rec._hp.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = clip(isNonEmptyString(rec.email) ? rec.email : '', MAX_EMAIL);
  const nameRaw = clip(isNonEmptyString(rec.name) ? rec.name : '', MAX_NAME);
  const phoneRaw = clip(isNonEmptyString(rec.phone) ? rec.phone : '', MAX_PHONE);
  const restaurantRaw = clip(isNonEmptyString(rec.restaurant_name) ? rec.restaurant_name : '', MAX_RESTAURANT);
  const messageRaw = clip(isNonEmptyString(rec.message) ? rec.message : '', MAX_MESSAGE);
  const name = nameRaw || null;
  const phone = phoneRaw || null;
  const restaurantName = restaurantRaw || null;
  const message = messageRaw || null;

  if (phone !== null && !PHONE_SAFE_RE.test(phone)) {
    return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return jsonGenericError(503);
  }

  try {
    await insertMarketingLead({
      name,
      email,
      phone,
      restaurantName,
      message,
      source: 'chef-one-landing',
    });
    void sendLeadNotificationEmail({
      name,
      email,
      phone,
      restaurantName,
      message,
      source: 'chef-one-landing',
    }).catch(() => {
      /* notify-lead-email puede loguear */
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return logCriticalAndGeneric('POST /api/leads', err);
  }
}
