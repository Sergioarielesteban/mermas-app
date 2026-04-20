type OpenWhatsAppOptions = {
  popupWindow?: Window | null;
  fallbackDelayMs?: number;
};

type OpenWhatsAppResult = {
  ok: boolean;
  phone: string | null;
};

const MOBILE_UA_RE = /android|iphone|ipad|ipod/i;

export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  return digits || null;
}

function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return true;
  const ua = window.navigator.userAgent ?? '';
  return !MOBILE_UA_RE.test(ua);
}

function navigateToUrl(url: string, popupWindow?: Window | null) {
  if (popupWindow && !popupWindow.closed) {
    popupWindow.location.href = url;
    return;
  }
  window.location.href = url;
}

export function openWhatsApp(
  rawPhone: string | null | undefined,
  message: string,
  options?: OpenWhatsAppOptions,
): OpenWhatsAppResult {
  if (typeof window === 'undefined') return { ok: false, phone: null };
  const phone = normalizeWhatsappPhone(rawPhone);
  if (!phone) return { ok: false, phone: null };

  const encodedMessage = encodeURIComponent(message ?? '');
  const appUrl = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
  const webUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`;

  if (isDesktopDevice()) {
    if (options?.popupWindow && !options.popupWindow.closed) {
      options.popupWindow.location.href = webUrl;
    } else {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
    return { ok: true, phone };
  }

  const delayMs = Math.max(800, Math.min(1200, options?.fallbackDelayMs ?? 1000));
  let pageHidden = false;

  const onVisibility = () => {
    pageHidden = document.visibilityState === 'hidden';
  };
  document.addEventListener('visibilitychange', onVisibility, { once: false });

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (pageHidden) return;
    navigateToUrl(webUrl, options?.popupWindow);
  }, delayMs);

  navigateToUrl(appUrl, options?.popupWindow);
  return { ok: true, phone };
}
