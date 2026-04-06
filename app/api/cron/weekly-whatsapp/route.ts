import { NextResponse } from 'next/server';
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
    const body = await response.text();
    throw new Error(`Twilio error: ${body}`);
  }
}

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json({ ok: false, reason: 'Missing env vars' }, { status: 500 });
    }

    const snapshot = await getSnapshotByEmail(ownerEmail);
    if (!snapshot) {
      return NextResponse.json({ ok: false, reason: 'No synced data found' }, { status: 404 });
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
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 },
    );
  }
}
