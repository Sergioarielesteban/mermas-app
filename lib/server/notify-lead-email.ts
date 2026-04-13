/**
 * Aviso por correo cuando entra una solicitud desde la landing (opcional).
 * Requiere en Vercel: RESEND_API_KEY + LEADS_NOTIFY_EMAIL (+ RESEND_FROM si usas dominio propio).
 */
export type LeadEmailPayload = {
  name: string | null;
  email: string;
  phone: string | null;
  restaurantName: string | null;
  message: string | null;
  source?: string;
};

export async function sendLeadNotificationEmail(payload: LeadEmailPayload): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.LEADS_NOTIFY_EMAIL?.trim();
  if (!apiKey || !to) {
    return { ok: true, skipped: true };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ?? 'Chef-One <onboarding@resend.dev>';

  const lines = [
    'Nueva solicitud desde chef-one.com',
    payload.source ? `Origen: ${payload.source}` : null,
    `Nombre: ${payload.name ?? '—'}`,
    `Email: ${payload.email}`,
    `Teléfono: ${payload.phone ?? '—'}`,
    `Restaurante / local: ${payload.restaurantName ?? '—'}`,
    '',
    'Mensaje:',
    payload.message?.trim() || '—',
  ].filter(Boolean) as string[];

  const text = lines.join('\n');
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">${lines.map((l) => esc(l)).join('<br/>')}</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Chef-One · Consulta: ${payload.email}`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[leads] Resend error:', res.status, body);
    return { ok: false };
  }
  return { ok: true };
}
