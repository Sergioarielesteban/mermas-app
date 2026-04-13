export type MarketingContactLinks = {
  /** Solo dígitos, con prefijo país (ej. 34600111222) */
  digits: string;
  telHref: string;
  whatsappUrl: string;
};

/**
 * `NEXT_PUBLIC_CONTACT_PHONE`: número en formato internacional, solo dígitos o con espacios.
 * Ejemplo: 34600111222 o +34 600 111 222
 */
export function parseMarketingContactPhone(envValue: string | undefined): MarketingContactLinks | null {
  if (!envValue?.trim()) return null;
  const digits = envValue.replace(/\D/g, '');
  if (digits.length < 9) return null;
  const telHref = `tel:+${digits}`;
  const whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent('Hola, me interesa Chef-One.')}`;
  return { digits, telHref, whatsappUrl };
}

/** Número público de contacto (solo dígitos, con prefijo país). Sobrescribible con NEXT_PUBLIC_CONTACT_PHONE. */
const DEFAULT_CONTACT_PHONE_E164_DIGITS = '34668541933';

export function getMarketingContactPhone(): MarketingContactLinks | null {
  const raw = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || DEFAULT_CONTACT_PHONE_E164_DIGITS;
  return parseMarketingContactPhone(raw);
}
