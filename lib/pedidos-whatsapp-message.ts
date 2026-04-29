import { formatQuantityWithUnit } from '@/lib/pedidos-format';
import type { Unit } from '@/lib/types';

/** Separador de bloques en cuerpo de pedido (WhatsApp). 14× U+2501. */
export const WHATSAPP_PEDIDO_SEPARATOR = '━━━━━━━━━━━━━━';

const EN_DASH = '\u2013';

const SMALL_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'e',
  'en',
  'con',
  'por',
  'a',
  'al',
]);

/**
 * Limpia nombre de producto para WhatsApp: sin TODO MAYÚSCULAS, mantiene tokens tipo 5x1 / 8x500.
 */
export function cleanProductNameForWhatsapp(name: string): string {
  const s = name.replace(/\s+/g, ' ').trim();
  if (!s) return s;

  return s
    .split(/\s+/)
    .map((word, index) => {
      if (/^\d+x\d+(\.\d+)?$/i.test(word)) {
        return word.replace(/X/g, 'x');
      }
      if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      if (word === word.toUpperCase()) {
        if (index > 0 && SMALL_WORDS.has(lower)) {
          return lower;
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

export function normalizeLocalNameForWhatsapp(raw: string): string {
  const cleaned = raw.replace(/\bCAN\b/gi, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'CHEF-ONE MATARO';
}

function formatFechaEsFromYmd(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) {
    return ymd?.trim() || '—';
  }
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('es-ES');
}

export type PedidoWhatsappItem = {
  productName: string;
  quantity: number;
  unit: Unit;
};

export type BuildPedidoWhatsappMessageInput = {
  localDisplayName: string;
  /** Fecha del pedido ya formateada (p. ej. 22/4/2026) */
  fechaPedidoDisplay: string;
  /** Fecha de entrega ya formateada en es-ES o YYYY-MM-DD */
  fechaEntregaDisplay: string;
  responsable: string;
  items: PedidoWhatsappItem[];
  contentRevisedAfterSent?: boolean;
  /** Notas del pedido (texto plano) */
  notes?: string;
};

/**
 * Cuerpo del mensaje de pedido para WhatsApp. Sin HTML. Emojis: 📦 📅 🚚 👤 🧾 ✅
 * Codificación del enlace: encodeURIComponent(mensaje) (p. ej. en {@link openWhatsAppMessage}).
 */
export function buildPedidoWhatsappMessage(input: BuildPedidoWhatsappMessageInput): string {
  const local = normalizeLocalNameForWhatsapp(input.localDisplayName);
  const responsable = input.responsable.replace(/\s+/g, ' ').trim() || '—';
  const fechaPedido = input.fechaPedidoDisplay.replace(/\s+/g, ' ').trim();
  const entRaw = input.fechaEntregaDisplay.replace(/\s+/g, ' ').trim();
  const fechaEntrega = /^\d{4}-\d{2}-\d{2}/.test(entRaw) ? formatFechaEsFromYmd(entRaw) : entRaw;
  const notes = input.notes?.replace(/\s+/g, ' ').trim();

  const listLines = input.items.map((item) => {
    const name = cleanProductNameForWhatsapp(item.productName);
    const qty = formatQuantityWithUnit(item.quantity, item.unit);
    return `• ${name} → ${qty}`;
  });

  const lines: string[] = [
    `📦 LOCAL ${EN_DASH} ${local}`,
    `📅 Pedido: ${fechaPedido}`,
    `🚚 Entrega: ${fechaEntrega}`,
    `👤 Responsable: ${responsable}`,
  ];

  if (input.contentRevisedAfterSent) {
    lines.push('Pedido actualizado (líneas revisadas tras un envío anterior).');
  }

  lines.push(
    WHATSAPP_PEDIDO_SEPARATOR,
    '🧾 DETALLE PEDIDO',
    ...listLines,
    WHATSAPP_PEDIDO_SEPARATOR,
  );

  if (notes) {
    lines.push(`Notas: ${notes}`);
  }

  lines.push('✅ Por favor, confirmar recepción del pedido.', 'Gracias.');

  return lines.join('\n');
}
