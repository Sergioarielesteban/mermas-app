export type OpenWhatsAppMessageOptions = {
  /**
   * Ventana destino (p. ej. pestaña en blanco). Si existe, se usa `location.href` ahí
   * en lugar de la ventana principal — sin abrir WhatsApp con `window.open`.
   */
  popupWindow?: Window | null;
  fallbackDelayMs?: number;
};

export type OpenWhatsAppMessageResult = {
  ok: boolean;
  phone: string | null;
};

const WHATSAPP_FALLBACK_BANNER_ID = 'chef-one-whatsapp-fallback-banner';

/**
 * Limpia el teléfono: quita espacios, +, guiones y cualquier no dígito.
 * Si faltan dígitos de país (9 dígitos típicos ES), antepone 34.
 */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9) digits = `34${digits}`;
  return digits;
}

function buildWhatsAppApiSendUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message ?? '');
  return `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${text}`;
}

function buildAndroidWhatsAppIntentUrl(phoneDigits: string, message: string): string {
  const text = encodeURIComponent(message ?? '');
  return `intent://send?phone=${phoneDigits}&text=${text}#Intent;scheme=smsto;package=com.whatsapp;end`;
}

function navigateTo(url: string, target: Window) {
  target.location.href = url;
}

function removeWhatsAppFallbackBanner() {
  if (typeof document === 'undefined') return;
  document.getElementById(WHATSAPP_FALLBACK_BANNER_ID)?.remove();
}

function showWhatsAppFallbackBanner(fallbackUrl: string) {
  if (typeof document === 'undefined') return;
  removeWhatsAppFallbackBanner();

  const bar = document.createElement('div');
  bar.id = WHATSAPP_FALLBACK_BANNER_ID;
  bar.setAttribute('role', 'status');
  bar.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'bottom:0',
    'z-index:2147483646',
    'padding:12px 14px',
    'background:#111827',
    'color:#f9fafb',
    'font:14px/1.35 system-ui,-apple-system,sans-serif',
    'box-shadow:0 -4px 24px rgba(0,0,0,.2)',
    'display:flex',
    'flex-wrap:wrap',
    'align-items:center',
    'justify-content:center',
    'gap:8px',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'Si WhatsApp no se abre,';

  const link = document.createElement('a');
  link.href = fallbackUrl;
  link.textContent = 'pulsa aquí';
  link.style.cssText = 'color:#93c5fd;font-weight:600;text-decoration:underline';
  link.rel = 'noopener noreferrer';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Cerrar';
  close.setAttribute('aria-label', 'Cerrar aviso de WhatsApp');
  close.style.cssText =
    'margin-left:8px;padding:4px 10px;border-radius:8px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;font:inherit;cursor:pointer';
  close.addEventListener('click', removeWhatsAppFallbackBanner);

  bar.appendChild(text);
  bar.appendChild(link);
  bar.appendChild(close);
  document.body.appendChild(bar);

  window.setTimeout(removeWhatsAppFallbackBanner, 120_000);
}

function scheduleAndroidFallback(fallbackUrl: string, delayMs: number) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let mayHaveLeft = false;
  const mark = () => {
    mayHaveLeft = true;
  };

  document.addEventListener('visibilitychange', mark);
  window.addEventListener('pagehide', mark);
  window.addEventListener('blur', mark);

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', mark);
    window.removeEventListener('pagehide', mark);
    window.removeEventListener('blur', mark);
    if (!mayHaveLeft) showWhatsAppFallbackBanner(fallbackUrl);
  }, delayMs);
}

/**
 * Abre WhatsApp con el mensaje indicado: intent nativo en Android, API HTTPS en el resto.
 * Usa siempre `location.href` (nunca `window.open` para la URL de WhatsApp).
 */
export function openWhatsAppMessage(
  rawPhone: string | null | undefined,
  message: string,
  options?: OpenWhatsAppMessageOptions,
): OpenWhatsAppMessageResult {
  if (typeof window === 'undefined') return { ok: false, phone: null };

  const phone = normalizeWhatsappPhone(rawPhone);
  if (!phone) return { ok: false, phone: null };

  const targetWindow =
    options?.popupWindow && !options.popupWindow.closed ? options.popupWindow : window;
  const fallbackUrl = buildWhatsAppApiSendUrl(phone, message);
  const delayMs = Math.max(1500, Math.min(3500, options?.fallbackDelayMs ?? 2300));

  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    const intentUrl = buildAndroidWhatsAppIntentUrl(phone, message);
    navigateTo(intentUrl, targetWindow);
    scheduleAndroidFallback(fallbackUrl, delayMs);
    return { ok: true, phone };
  }

  navigateTo(fallbackUrl, targetWindow);
  return { ok: true, phone };
}

/** @deprecated Usar {@link openWhatsAppMessage}. */
export function openWhatsApp(
  rawPhone: string | null | undefined,
  message: string,
  options?: OpenWhatsAppMessageOptions,
): OpenWhatsAppMessageResult {
  return openWhatsAppMessage(rawPhone, message, options);
}
