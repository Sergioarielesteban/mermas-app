/**
 * @deprecated Usar POST /api/pedidos/ocr. Alias temporal; misma implementación y límites.
 */
import { handlePedidosOcrPost } from '@/lib/ocr/post-handler';

export const maxDuration = 60;

export const POST = handlePedidosOcrPost;
