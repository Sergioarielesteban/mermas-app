export const runtime = 'nodejs';

export async function GET() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  return Response.json({
    length: raw.length,
    first50: raw.slice(0, 50),
    last20: raw.slice(-20),
    hasRealNewlines: raw.includes('\n'),
    hasEscapedNewlines: raw.includes('\\n'),
  });
}
