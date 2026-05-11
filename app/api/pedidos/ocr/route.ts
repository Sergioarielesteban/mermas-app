/**
 * OCR de albarán (imagen/PDF): solo Google Document AI → texto plano.
 * Interpretación estructurada + Gemini: POST /api/ocr/process.
 */
import { handlePedidosOcrPost } from '@/lib/ocr/post-handler';

export const maxDuration = 60;

export const POST = handlePedidosOcrPost;
