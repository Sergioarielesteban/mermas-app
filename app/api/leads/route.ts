/**
 * Formulario público landing: sin sesión; anti-spam vía honeypot + validación email.
 */
import { NextResponse } from 'next/server';
import { sendLeadNotificationEmail } from '@/lib/server/notify-lead-email';
import { insertMarketingLead, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;
const MAX_RESTAURANT = 200;
const MAX_MESSAGE = 4000;

function clip(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Petición no válida.' }, { status: 400 });
  }

  if (typeof body._hp === 'string' && body._hp.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = clip(String(body.email ?? ''), MAX_EMAIL);
  const nameRaw = clip(String(body.name ?? ''), MAX_NAME);
  const phoneRaw = clip(String(body.phone ?? ''), MAX_PHONE);
  const restaurantRaw = clip(String(body.restaurant_name ?? ''), MAX_RESTAURANT);
  const messageRaw = clip(String(body.message ?? ''), MAX_MESSAGE);
  const name = nameRaw || null;
  const phone = phoneRaw || null;
  const restaurantName = restaurantRaw || null;
  const message = messageRaw || null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Indica un email válido.' }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_configured',
        error:
          'El envío de formularios no está activado en el servidor. Añade la tabla marketing_leads y SUPABASE_SERVICE_ROLE_KEY, o escríbenos por email.',
      },
      { status: 503 },
    );
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
      /* ya logueado en notify-lead-email */
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo registrar. Inténtalo de nuevo más tarde.' }, { status: 500 });
  }
}
