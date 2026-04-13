import { NextResponse } from 'next/server';
import { insertMarketingLead, isSupabaseAdminConfigured } from '@/lib/server/supabase-admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const email = String(body.email ?? '').trim();
  const name = String(body.name ?? '').trim() || null;
  const phone = String(body.phone ?? '').trim() || null;
  const restaurantName = String(body.restaurant_name ?? '').trim() || null;
  const message = String(body.message ?? '').trim() || null;

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
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'No se pudo registrar. Inténtalo de nuevo más tarde.' }, { status: 500 });
  }
}
