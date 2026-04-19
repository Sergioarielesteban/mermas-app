/**
 * Proveedor AWS Textract: solo extracción de texto; sin lógica de negocio de albaranes.
 */
import { DetectDocumentTextCommand, TextractClient, type Block } from '@aws-sdk/client-textract';

export type TextractRawOutput = {
  providerId: 'textract';
  plainText: string;
};

function compareLineReadingOrder(a: Block, b: Block) {
  const ta = a.Geometry?.BoundingBox?.Top ?? 0;
  const tb = b.Geometry?.BoundingBox?.Top ?? 0;
  if (Math.abs(ta - tb) > 0.004) return ta - tb;
  const la = a.Geometry?.BoundingBox?.Left ?? 0;
  const lb = b.Geometry?.BoundingBox?.Left ?? 0;
  return la - lb;
}

function blocksToPlainText(blocks: Block[] | undefined) {
  if (!blocks?.length) return '';
  const lines = blocks.filter((b) => b.BlockType === 'LINE' && b.Text);
  lines.sort(compareLineReadingOrder);
  return lines.map((b) => b.Text!.trim()).join('\n');
}

function getTextractClient() {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('config');
  }
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return new TextractClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    });
  }
  return new TextractClient({ region });
}

/** Ejecuta DetectDocumentText y devuelve texto plano unificado. */
export async function extractTextractDocument(imageBytes: Buffer): Promise<TextractRawOutput> {
  const client = getTextractClient();
  const out = await client.send(
    new DetectDocumentTextCommand({
      Document: { Bytes: imageBytes },
    }),
  );
  const plainText = blocksToPlainText(out.Blocks);
  return { providerId: 'textract', plainText };
}
