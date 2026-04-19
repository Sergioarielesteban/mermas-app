/**
 * Cron externo: Bearer CRON_SECRET con comparación en tiempo constante.
 */
import { NextResponse } from 'next/server';
import { jsonGenericError, logCriticalAndGeneric } from '@/lib/server/api-safe';
import { logSecurityEvent } from '@/lib/server/security-log';
import { timingSafeEqualString } from '@/lib/server/timing-safe-secret';
import { getSnapshotByEmail } from '@/lib/server/supabase-admin';
import { buildWeeklyWhatsappMessage, shouldSendNowMadrid } from '@/lib/server/weekly-summary';

async function sendWhatsappMessage(input: { accountSid: string; authToken: string; from: string; to: string; body: string }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set('From', input.from);
  form.set('To', input.to);
  form.set('Body', input.body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.accountSid}:${input.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    await response.text().catch(() => undefined);
    throw new Error('twilio');
  }
}

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      logSecurityEvent('access_denied', { route: 'cron/weekly-whatsapp', reason: 'no_secret' });
      return jsonGenericError(503);
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const prefix = 'Bearer ';
    const token =
      authHeader.startsWith(prefix) ? authHeader.slice(prefix.length).trim() : '';

    if (!token || !timingSafeEqualString(token, secret)) {
      logSecurityEvent('access_denied', { route: 'cron/weekly-whatsapp', reason: 'bad_token' });
      return NextResponse.json({ ok: false, error: 'Request failed' }, { status: 401 });
    }

    if (!shouldSendNowMadrid(new Date())) {
      return NextResponse.json({ ok: true, skipped: 'Outside Monday 08:00 Europe/Madrid window' });
    }

    const ownerEmail = process.env.WEEKLY_REPORT_EMAIL;
    const to = process.env.WHATSAPP_TO;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!ownerEmail || !to || !from || !accountSid || !authToken) {
      return jsonGenericError(500);
    }

    const snapshot = await getSnapshotByEmail(ownerEmail);
    if (!snapshot) {
      return jsonGenericError(404);
    }

    const summary = buildWeeklyWhatsappMessage({
      mermas: snapshot.mermas ?? [],
      products: snapshot.products ?? [],
      now: new Date(),
    });

    await sendWhatsappMessage({
      accountSid,
      authToken,
      from,
      to,
      body: summary.text,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      period: { from: summary.from, to: summary.to },
      total: summary.total,
      records: summary.count,
    });
  } catch (err) {
    return logCriticalAndGeneric('GET /api/cron/weekly-whatsapp', err);
  }
}
