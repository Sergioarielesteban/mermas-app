export const runtime = 'nodejs';

type ServiceAccountInfo = {
  client_email: string;
  private_key: string;
  project_id: string | null;
};

function unwrapServiceAccountRaw(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length > 2) s = s.slice(1, -1).trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length > 2) {
    try {
      const once = JSON.parse(s) as unknown;
      if (typeof once === 'string' && once.includes('{')) return once.trim();
    } catch {
      // noop
    }
  }
  return s;
}

function parseServiceAccountJson(raw: string): ServiceAccountInfo {
  const unwrapped = unwrapServiceAccountRaw(raw);
  const parsed = JSON.parse(unwrapped) as Record<string, unknown>;
  const client_email = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
  let private_key = typeof parsed.private_key === 'string' ? parsed.private_key : '';
  private_key = private_key.replace(/\\n/g, '\n');
  const project_id =
    typeof parsed.project_id === 'string' && parsed.project_id.trim() ? parsed.project_id.trim() : null;
  return { client_email, private_key, project_id };
}

function safeProjectIdValue(projectId: string): string {
  if (!projectId) return '';
  return projectId.length <= 8 ? projectId : `${projectId.slice(0, 8)}…`;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token ?? '';
}

function documentAiHost(location: string): string {
  return location === 'us' ? 'documentai.googleapis.com' : `${location}-documentai.googleapis.com`;
}

export async function GET() {
  const projectIdEnv = (process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim();
  const location = (process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? '').trim();
  const processorId = (process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID ?? '').trim();
  const serviceAccountJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  const geminiKeyPresent = Boolean((process.env.GEMINI_API_KEY ?? '').trim());

  let serviceAccountJsonParsable = false;
  let serviceAccountEmail = '';
  let privateKeyPresent = false;
  let privateKeyHasBeginMarker = false;
  let projectIdFromJson = '';

  if (serviceAccountJson) {
    try {
      const parsed = parseServiceAccountJson(serviceAccountJson);
      serviceAccountJsonParsable = true;
      serviceAccountEmail = parsed.client_email;
      privateKeyPresent = Boolean(parsed.private_key);
      privateKeyHasBeginMarker = parsed.private_key.includes('BEGIN PRIVATE KEY');
      projectIdFromJson = parsed.project_id ?? '';
    } catch {
      serviceAccountJsonParsable = false;
    }
  }

  const projectId = projectIdEnv || projectIdFromJson;
  const projectIdPresent = Boolean(projectId);
  const processorIdPresent = Boolean(processorId);

  let ok = false;
  let error: string | null = null;
  let httpStatus: number | null = null;
  let body: unknown = null;
  let processorUrl: string | null = null;

  try {
    if (!projectId || !location || !processorId || !serviceAccountJsonParsable) {
      throw new Error('ocr_env_missing_or_invalid');
    }

    const parsed = parseServiceAccountJson(serviceAccountJson);
    const accessToken = await getAccessToken(parsed.client_email, parsed.private_key);
    const host = documentAiHost(location);
    processorUrl = `https://${host}/v1/projects/${projectId}/locations/${location}/processors/${processorId}`;
    const res = await fetch(processorUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    httpStatus = res.status;
    body = await res.json();
    ok = res.ok;
    if (!res.ok) {
      error = `HTTP ${res.status}`;
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? `${err.message} | ${err.stack}` : String(err);
  }

  return Response.json({
    ok,
    error,
    httpStatus,
    processorUrl,
    body,
    projectIdPresent,
    projectIdValue: safeProjectIdValue(projectId),
    location,
    processorIdPresent,
    processorIdLength: processorId.length,
    serviceAccountJsonPresent: Boolean(serviceAccountJson),
    serviceAccountJsonParsable,
    serviceAccountEmail,
    privateKeyPresent,
    privateKeyHasBeginMarker,
    geminiKeyPresent,
    runtime: 'nodejs',
  });
}
