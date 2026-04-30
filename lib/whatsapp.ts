export type OpenWhatsAppMessageOptions = {
  /**
   * Ventana destino (p. ej. pestaña en blanco). Si existe, se usa `location.href` ahí
   * en lugar de la ventana principal — sin abrir WhatsApp con `window.open`.
   */
  popupWindow?: Window | null;
};

export type OpenWhatsAppMessageResult = {
  ok: boolean;
  phone: string | null;
};

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

function navigateTo(url: string, target: Window) {
  target.location.href = url;
}

/**
 * Abre WhatsApp con el mensaje indicado.
 *
 * En **Android** ya no usamos `intent://…;scheme=smsto;package=com.whatsapp`: ese flujo
 * hacía que WhatsApp recibiera el número mal y mostraba «no está registrado en WhatsApp»
 * aunque el mismo número funcionara en iPhone con `api.whatsapp.com`.
 *
 * Mismo enlace HTTPS en todas las plataformas: abre la app si está instalada (comportamiento
 * alineado con iOS). `location.href` únicamente (nunca `window.open` para la URL de WhatsApp).
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
  const url = buildWhatsAppApiSendUrl(phone, message);
  navigateTo(url, targetWindow);
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
