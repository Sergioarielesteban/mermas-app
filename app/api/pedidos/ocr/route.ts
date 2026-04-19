/**
 * OCR de albaranes (genérico). Proveedor según OCR_PROVIDER (p. ej. textract).
 */
import { handlePedidosOcrPost } from '@/lib/ocr/post-handler';

export const maxDuration = 60;

export const POST = handlePedidosOcrPost;
