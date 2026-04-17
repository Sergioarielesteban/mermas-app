import { DetectDocumentTextCommand, TextractClient, type Block } from '@aws-sdk/client-textract';
import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';

export const maxDuration = 60;

const TEXTRACT_MAX_BYTES = 5 * 1024 * 1024;

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
    throw new Error('Falta AWS_REGION en el servidor.');
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

export async function POST(request: Request) {
  try {
    const auth = await requireAllowedSupabaseUser(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, reason: auth.message }, { status: auth.status });
    }

    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof Blob)) {
      return NextResponse.json({ ok: false, reason: 'Falta el campo image.' }, { status: 400 });
    }

    const buf = Buffer.from(await image.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ ok: false, reason: 'Imagen vacía.' }, { status: 400 });
    }
    if (buf.length > TEXTRACT_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, reason: `Imagen demasiado grande (máx. ${TEXTRACT_MAX_BYTES} bytes para Textract).` },
        { status: 413 },
      );
    }

    const client = getTextractClient();
    const out = await client.send(
      new DetectDocumentTextCommand({
        Document: { Bytes: buf },
      }),
    );

    const text = blocksToPlainText(out.Blocks);
    return NextResponse.json({ ok: true, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Textract falló.';
    return NextResponse.json({ ok: false, reason: message }, { status: 500 });
  }
}
