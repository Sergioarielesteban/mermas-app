/**
 * Google Cloud Document AI provider (REST).
 *
 * Auth: `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON completo en env). En Vercel el
 * `private_key` suele llevar `\n` literales; hay que convertirlos a saltos
 * reales antes de pasarlos a GoogleAuth.
 *
 * Usado por POST /api/ocr/process y por POST /api/pedidos/ocr (solo texto).
 */

import { logSecurityEvent } from '@/lib/server/security-log';

export type DocumentAiRawEntity = {
  type: string;
  text: string;
  normalizedValue: string | null;
  confidence: number;
  properties?: DocumentAiRawEntity[];
};

export type DocumentAiResult = {
  providerId: 'document-ai';
  processor: string;
  plainText: string;
  pageCount: number;
  mimeType: string;
  entities: DocumentAiRawEntity[];
  durationMs: number;
};

type RestEntity = {
  type?: string | null;
  mentionText?: string | null;
  confidence?: number | null;
  normalizedValue?: {
    text?: string | null;
    dateValue?: { year?: number; month?: number; day?: number } | null;
    moneyValue?: {
      units?: string | number | null;
      nanos?: number | null;
      currencyCode?: string | null;
    } | null;
  } | null;
  properties?: RestEntity[] | null;
};

type RestDocument = {
  text?: string | null;
  pages?: unknown[] | null;
  entities?: RestEntity[] | null;
};

type RestProcessResponse = {
  document?: RestDocument | null;
  error?: { message?: string; code?: number; status?: string };
};

type RestProcessor = {
  name?: string;
  displayName?: string;
  type?: string;
  state?: string;
};

let diagnosticsLogged = false;

function logDocumentAiDiagnostics(meta: Record<string, string | number | boolean | undefined>) {
  try {
    console.info('[document-ai]', JSON.stringify({ t: new Date().toISOString(), ...meta }));
  } catch {
    console.info('[document-ai] diagnostics');
  }
}

/** Desenvuelve JSON pegado entre comillas dobles (Vercel / copias desde shell). */
function unwrapServiceAccountRaw(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length > 2) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length > 2) {
    try {
      const once = JSON.parse(s) as unknown;
      if (typeof once === 'string' && once.includes('{')) {
        return once.trim();
      }
    } catch {
      // seguir con s sin parsear doble
    }
  }
  return s;
}

type ParsedServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string | null;
};

function parseServiceAccountJson(raw: string): ParsedServiceAccount {
  const unwrapped = unwrapServiceAccountRaw(raw);
  const credentials = JSON.parse(unwrapped) as Record<string, unknown>;
  const client_email = typeof credentials.client_email === 'string' ? credentials.client_email.trim() : '';
  let private_key = typeof credentials.private_key === 'string' ? credentials.private_key : '';
  private_key = private_key.replace(/\\n/g, '\n');
  const project_id =
    typeof credentials.project_id === 'string' && credentials.project_id.trim()
      ? credentials.project_id.trim()
      : null;
  if (!client_email || !private_key) {
    throw new Error('invalid_service_account_fields');
  }
  return { client_email, private_key, project_id };
}

function parseServiceAccountCredentials(raw: string): Record<string, unknown> {
  const unwrapped = unwrapServiceAccountRaw(raw);
  const credentials = JSON.parse(unwrapped) as Record<string, unknown>;
  if (typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return credentials;
}

type DocumentAiEnv = {
  projectId: string;
  location: string;
  processorId: string;
  serviceAccountJson: string;
};

function readEnvStrings(): {
  projectIdEnv: string;
  location: string;
  processorId: string;
  serviceAccountJson: string;
} {
  const projectIdEnv = (process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim();
  const location = (process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? '').trim();
  const processorId = (process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID ?? '').trim();
  const serviceAccountJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim();
  return { projectIdEnv, location, processorId, serviceAccountJson };
}

function readEnvOrThrow(): DocumentAiEnv {
  const { projectIdEnv, location, processorId, serviceAccountJson } = readEnvStrings();
  if (!location || !processorId || !serviceAccountJson) {
    throw new Error('document_ai_config_missing');
  }
  let projectId = projectIdEnv;
  if (!projectId) {
    try {
      const parsed = parseServiceAccountJson(serviceAccountJson);
      if (parsed.project_id) projectId = parsed.project_id;
    } catch {
      // readEnvOrThrow sigue sin projectId
    }
  }
  if (!projectId) {
    throw new Error('document_ai_config_missing');
  }
  return { projectId, location, processorId, serviceAccountJson };
}

function documentAiHost(location: string): string {
  return location === 'us' ? 'documentai.googleapis.com' : `${location}-documentai.googleapis.com`;
}

function processorResourcePath(projectId: string, location: string, processorId: string): string {
  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const raw = serviceAccountJson;
  const hasRaw = Boolean(raw && raw.length > 0);

  try {
    const credentials = parseServiceAccountCredentials(raw);
    parseServiceAccountJson(raw);

    if (!diagnosticsLogged) {
      diagnosticsLogged = true;
      const parsed = parseServiceAccountJson(raw);
      logDocumentAiDiagnostics({
        hasServiceAccountJson: hasRaw,
        serviceAccountJsonLength: raw.length,
        jsonParseOk: true,
        hasClientEmail: parsed.client_email.length > 0,
        hasPrivateKey: parsed.private_key.length > 0,
        privateKeyApproxLength: parsed.private_key.length,
        hasProjectId: Boolean((process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim() || parsed.project_id),
        hasProcessorId: Boolean((process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID ?? '').trim()),
        hasLocation: Boolean((process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? '').trim()),
        projectIdFromEnv: Boolean((process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim()),
        transport: 'rest',
      });
    }

    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('missing_access_token');
    return token;
  } catch (e) {
    if (!diagnosticsLogged) {
      diagnosticsLogged = true;
      logDocumentAiDiagnostics({
        hasServiceAccountJson: hasRaw,
        serviceAccountJsonLength: raw.length,
        jsonParseOk: false,
        error: e instanceof Error ? e.name : 'unknown',
        transport: 'rest',
      });
    }
    logSecurityEvent('critical', {
      ocr: 'document_ai_sa_parse_failed',
      error: e instanceof Error ? e.message : 'unknown',
    });
    throw new Error('document_ai_service_account_invalid');
  }
}

export function isDocumentAiConfigured(): boolean {
  try {
    readEnvOrThrow();
    return true;
  } catch {
    return false;
  }
}

/** Nombres exactos de variables que usa esta integración (Vercel / .env.local). */
export const DOCUMENT_AI_ENV_KEYS = {
  projectId: 'GOOGLE_CLOUD_PROJECT_ID',
  location: 'GOOGLE_DOCUMENT_AI_LOCATION',
  processorId: 'GOOGLE_DOCUMENT_AI_PROCESSOR_ID',
  serviceAccountJson: 'GOOGLE_SERVICE_ACCOUNT_JSON',
} as const;

/**
 * Logs seguros de configuración OCR (sin private_key, sin API keys, sin JSON completo).
 * Llamar al inicio de POST /api/ocr/process y POST /api/pedidos/ocr.
 */
export function logOcrIntegrationDiagnostics(extra?: {
  endpoint?: string;
  mimeType?: string;
  fileSizeKb?: number;
}): void {
  const { projectIdEnv, location, processorId, serviceAccountJson } = readEnvStrings();

  let jsonParseOk = false;
  let serviceAccountEmailPresent = false;
  let privateKeyPresent = false;
  let projectIdFromJson: string | null = null;

  if (serviceAccountJson) {
    try {
      const parsed = parseServiceAccountJson(serviceAccountJson);
      jsonParseOk = true;
      serviceAccountEmailPresent = parsed.client_email.length > 0;
      privateKeyPresent = parsed.private_key.length > 0;
      projectIdFromJson = parsed.project_id;
    } catch {
      jsonParseOk = false;
    }
  }

  const projectIdPresent = Boolean(projectIdEnv || projectIdFromJson);
  const projectIdSource = projectIdEnv
    ? 'GOOGLE_CLOUD_PROJECT_ID'
    : projectIdFromJson
      ? 'service_account.project_id'
      : 'missing';

  try {
    console.info(
      '[ocr/env]',
      JSON.stringify({
        endpoint: extra?.endpoint ?? 'unknown',
        runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
        envKeys: DOCUMENT_AI_ENV_KEYS,
        projectIdPresent,
        projectIdSource,
        location: location || '(missing)',
        processorIdPresent: Boolean(processorId),
        serviceAccountJsonPresent: Boolean(serviceAccountJson),
        serviceAccountJsonLength: serviceAccountJson.length,
        serviceAccountEmailPresent,
        jsonParseOk,
        privateKeyPresent,
        geminiApiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
        mimeType: extra?.mimeType,
        fileSizeKb: extra?.fileSizeKb,
        transport: 'rest',
      }),
    );
  } catch {
    console.info('[ocr/env] diagnostics_unavailable');
  }
}

function flattenEntity(e: RestEntity): DocumentAiRawEntity {
  const properties = (e.properties ?? []).map(flattenEntity);
  const normalizedValue =
    e.normalizedValue?.text != null
      ? String(e.normalizedValue.text)
      : e.normalizedValue?.dateValue
        ? formatDocAiDate(e.normalizedValue.dateValue)
        : e.normalizedValue?.moneyValue
          ? formatDocAiMoney(e.normalizedValue.moneyValue)
          : null;
  return {
    type: String(e.type ?? ''),
    text: String(e.mentionText ?? '').trim(),
    normalizedValue,
    confidence: typeof e.confidence === 'number' ? e.confidence : 0,
    properties: properties.length > 0 ? properties : undefined,
  };
}

function formatDocAiDate(d: { year?: number; month?: number; day?: number }): string {
  const y = typeof d.year === 'number' && d.year > 0 ? d.year : 0;
  const m = typeof d.month === 'number' && d.month > 0 ? d.month : 0;
  const day = typeof d.day === 'number' && d.day > 0 ? d.day : 0;
  if (!y || !m || !day) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDocAiMoney(m: {
  units?: string | number | null;
  nanos?: number | null;
  currencyCode?: string | null;
}): string {
  const units = typeof m.units === 'string' || typeof m.units === 'number' ? Number(m.units) : 0;
  const nanos = typeof m.nanos === 'number' ? m.nanos / 1e9 : 0;
  const amount = units + nanos;
  const currency = typeof m.currencyCode === 'string' ? m.currencyCode : '';
  return currency ? `${amount.toFixed(2)} ${currency}` : amount.toFixed(2);
}

function extractPlainText(doc: RestDocument | null | undefined): string {
  const text = typeof doc?.text === 'string' ? doc.text : '';
  if (!text) return '';
  return text.replace(/\u0000/g, '').trim();
}

function extractRestErrorHint(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403 || lower.includes('permission')) {
    return 'PERMISSION_DENIED — revisa el serviceAccount y los roles IAM';
  }
  if (status === 404 || lower.includes('not found')) {
    return 'NOT_FOUND — revisa projectId, location y processorId';
  }
  if (status === 400 || lower.includes('invalid')) {
    return 'INVALID_ARGUMENT — revisa mimeType, processorId o location';
  }
  if (status === 429) {
    return 'RESOURCE_EXHAUSTED — cuota agotada';
  }
  if (status >= 500) {
    return 'INTERNAL/UNAVAILABLE — error del servicio Document AI';
  }
  return 'Revisa credenciales, región y processorId en Vercel.';
}

function throwDocumentAiRestError(status: number, bodyText: string): never {
  const hint = extractRestErrorHint(status, bodyText);
  const enriched = new Error(
    `document_ai_google_error: REST HTTP ${status} ${bodyText} | hint=${hint}`,
  );
  (enriched as Error & { googleCode?: number; googleHint?: string }).googleCode = status;
  (enriched as Error & { googleHint?: string }).googleHint = hint;
  throw enriched;
}

// Tipos que Document AI acepta directamente. heic/heif no son compatibles.
const DOCUMENT_AI_SUPPORTED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp',
  'image/gif',
  'application/pdf',
]);

export type DocumentAiProcessorCheck = {
  ok: boolean;
  processorPath: string;
  processorDisplayName?: string;
  processorType?: string;
  state?: string;
  error?: string;
  hint?: string;
  googleCode?: number | string;
};

/**
 * Comprueba credenciales + región + processorId vía REST GET (sin subir archivo).
 */
export async function verifyDocumentAiProcessor(): Promise<DocumentAiProcessorCheck> {
  let env: DocumentAiEnv;
  try {
    env = readEnvOrThrow();
  } catch (e) {
    return {
      ok: false,
      processorPath: '',
      error: e instanceof Error ? e.message : 'document_ai_config_missing',
      hint: 'Faltan GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_DOCUMENT_AI_PROCESSOR_ID o GOOGLE_SERVICE_ACCOUNT_JSON.',
    };
  }

  const processorPath = processorResourcePath(env.projectId, env.location, env.processorId);
  const host = documentAiHost(env.location);
  const url = `https://${host}/v1/${processorPath}`;

  try {
    const token = await getGoogleAccessToken(env.serviceAccountJson);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const hint = extractRestErrorHint(res.status, bodyText);
      return {
        ok: false,
        processorPath,
        error: bodyText || `HTTP ${res.status}`,
        hint,
        googleCode: res.status,
      };
    }
    const processor = JSON.parse(bodyText) as RestProcessor;
    return {
      ok: true,
      processorPath,
      processorDisplayName: processor.displayName ?? undefined,
      processorType: processor.type ?? undefined,
      state: processor.state ?? undefined,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('document_ai_google_error')) {
      const hint = (e as Error & { googleHint?: string }).googleHint;
      const code = (e as Error & { googleCode?: number }).googleCode;
      return {
        ok: false,
        processorPath,
        error: e.message,
        hint,
        googleCode: code,
      };
    }
    return {
      ok: false,
      processorPath,
      error: e instanceof Error ? e.message : String(e),
      hint: 'Error de red o credenciales al contactar Document AI.',
    };
  }
}

export async function processDocumentAi(
  fileBytes: Buffer,
  mimeType: string,
): Promise<DocumentAiResult> {
  if (!DOCUMENT_AI_SUPPORTED_MIMES.has(mimeType)) {
    const err = new Error(
      `document_ai_mime_not_supported: el formato "${mimeType}" no es compatible con Document AI. ` +
        'Usa image/jpeg, image/png, image/webp, image/tiff o application/pdf.',
    );
    console.error('[document-ai] MIME no soportado:', mimeType);
    throw err;
  }

  const env = readEnvOrThrow();

  const missingEnvs: string[] = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) missingEnvs.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim()) missingEnvs.push('GOOGLE_DOCUMENT_AI_LOCATION');
  if (!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim()) missingEnvs.push('GOOGLE_DOCUMENT_AI_PROCESSOR_ID');
  if (!process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() && !env.projectId) {
    missingEnvs.push('GOOGLE_CLOUD_PROJECT_ID (o project_id en el JSON)');
  }
  if (missingEnvs.length > 0) {
    const msg = `document_ai_config_missing: faltan variables de entorno: ${missingEnvs.join(', ')}`;
    console.error('[document-ai]', msg);
    throw new Error(msg);
  }

  const projectId = env.projectId;
  const name = processorResourcePath(projectId, env.location, env.processorId);
  const host = documentAiHost(env.location);
  const url = `https://${host}/v1/${name}:process`;

  const fileSizeKb = Math.round(fileBytes.length / 1024);
  console.info(
    '[document-ai] pre-call',
    JSON.stringify({
      mimeType,
      fileSizeKb,
      fileSizeBytes: fileBytes.length,
      projectId,
      location: env.location,
      processorId: env.processorId,
      processorPath: name,
      transport: 'rest',
      url,
    }),
  );

  const { projectIdEnv, location, processorId, serviceAccountJson } = readEnvStrings();
  console.log('[document-ai] credentials check:', {
    projectId: projectIdEnv || projectId,
    location,
    processorId,
    hasKey: serviceAccountJson.length > 0,
    keyStart: serviceAccountJson.slice(0, 30),
  });

  const t0 = Date.now();
  const token = await getGoogleAccessToken(env.serviceAccountJson);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rawDocument: {
        content: fileBytes.toString('base64'),
        mimeType,
      },
    }),
  });

  const bodyText = await response.text();
  const durationMs = Date.now() - t0;

  if (!response.ok) {
    console.error(
      '[document-ai] ERROR REST',
      JSON.stringify({
        status: response.status,
        body: bodyText.slice(0, 2000),
        durationMs,
        processorPath: name,
        mimeType,
        fileSizeKb,
      }),
    );
    throwDocumentAiRestError(response.status, bodyText);
  }

  let parsed: RestProcessResponse;
  try {
    parsed = JSON.parse(bodyText) as RestProcessResponse;
  } catch {
    throw new Error(`document_ai_rest_error: invalid_json_response ${bodyText.slice(0, 500)}`);
  }

  const doc = parsed.document;
  const plainText = extractPlainText(doc);
  const entities = (doc?.entities ?? []).map(flattenEntity);
  const pageCount = doc?.pages?.length ?? 0;

  console.info(
    '[document-ai] OK',
    JSON.stringify({ durationMs, pageCount, plainTextLen: plainText.length, entities: entities.length, transport: 'rest' }),
  );

  return {
    providerId: 'document-ai',
    processor: name,
    plainText,
    pageCount,
    mimeType,
    entities,
    durationMs,
  };
}
