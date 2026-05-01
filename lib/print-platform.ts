/** Entornos donde AirPrint/WebKit obligan a abrir impresión en página dedicada y con toque explícito (no popups nuevos vacíos). */
export function shouldUseManualPrintOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}
