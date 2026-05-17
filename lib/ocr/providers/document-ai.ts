/**
 * Google Cloud Document AI provider.
 *
 * Auth: `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON completo en env). En Vercel el
 * `private_key` suele llevar `\n` literales; hay que convertirlos a saltos
 * reales antes de pasarlos al cliente.
 *
 * Usado por POST /api/ocr/process y por POST /api/pedidos/ocr (solo texto).
 */

import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai';
import { logSecurityEvent } from '@/lib/server/security-log';

type DocumentEntity = protos.google.cloud.documentai.v1.Document.IEntity;
type DocumentAiDocument = protos.google.cloud.documentai.v1.IDocument;

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

let cachedClient: DocumentProcessorServiceClient | null = null;
let cachedConfigHash: string | null = null;
/** Mismo `projectId` pasado al cliente (env o `project_id` del JSON). */
let lastResolvedProjectIdForDocumentAi: string | null = null;
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
      }),
    );
  } catch {
    console.info('[ocr/env] diagnostics_unavailable');
  }
}

function getClient(env: DocumentAiEnv): DocumentProcessorServiceClient {
  const hash = `${env.projectId}|${env.location}|${env.processorId}|${env.serviceAccountJson.length}`;
  if (cachedClient && cachedConfigHash === hash) return cachedClient;

  const raw = env.serviceAccountJson;
  const hasRaw = Boolean(raw && raw.length > 0);

  let parseOk = false;
  let hasClientEmail = false;
  let hasPrivateKey = false;
  let privateKeyLen = 0;
  let projectIdResolved = env.projectId;

  let credentials: { client_email: string; private_key: string };
  try {
    const parsed = parseServiceAccountJson(raw);
    parseOk = true;
    hasClientEmail = parsed.client_email.length > 0;
    hasPrivateKey = parsed.private_key.length > 0;
    privateKeyLen = parsed.private_key.length;
    projectIdResolved =
      (process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim() || parsed.project_id || env.projectId;
    if (!projectIdResolved) {
      throw new Error('missing_project_id');
    }
    credentials = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch (e) {
    if (!diagnosticsLogged) {
      diagnosticsLogged = true;
      logDocumentAiDiagnostics({
        hasServiceAccountJson: hasRaw,
        serviceAccountJsonLength: raw.length,
        jsonParseOk: false,
        hasClientEmail: false,
        hasPrivateKey: false,
        privateKeyApproxLength: 0,
        hasProjectId: Boolean((process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim()),
        hasProcessorId: Boolean((process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID ?? '').trim()),
        hasLocation: Boolean((process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? '').trim()),
        error: e instanceof Error ? e.name : 'unknown',
      });
    }
    logSecurityEvent('critical', {
      ocr: 'document_ai_sa_parse_failed',
      error: e instanceof Error ? e.message : 'unknown',
    });
    throw new Error('document_ai_service_account_invalid');
  }

  if (!diagnosticsLogged) {
    diagnosticsLogged = true;
    logDocumentAiDiagnostics({
      hasServiceAccountJson: hasRaw,
      serviceAccountJsonLength: raw.length,
      jsonParseOk: parseOk,
      hasClientEmail,
      hasPrivateKey,
      privateKeyApproxLength: privateKeyLen,
      hasProjectId: Boolean(projectIdResolved),
      hasProcessorId: Boolean((process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID ?? '').trim()),
      hasLocation: Boolean((process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? '').trim()),
      projectIdFromEnv: Boolean((process.env.GOOGLE_CLOUD_PROJECT_ID ?? '').trim()),
    });
  }

  const apiEndpoint =
    env.location && env.location !== 'us'
      ? `${env.location}-documentai.googleapis.com`
      : undefined;

  lastResolvedProjectIdForDocumentAi = projectIdResolved;

  cachedClient = new DocumentProcessorServiceClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: projectIdResolved,
    apiEndpoint,
  });
  cachedConfigHash = hash;
  return cachedClient;
}

function flattenEntity(e: DocumentEntity): DocumentAiRawEntity {
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

function formatDocAiDate(
  d: NonNullable<NonNullable<DocumentEntity['normalizedValue']>['dateValue']>,
): string {
  const y = typeof d.year === 'number' && d.year > 0 ? d.year : 0;
  const m = typeof d.month === 'number' && d.month > 0 ? d.month : 0;
  const day = typeof d.day === 'number' && d.day > 0 ? d.day : 0;
  if (!y || !m || !day) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDocAiMoney(
  m: NonNullable<NonNullable<DocumentEntity['normalizedValue']>['moneyValue']>,
): string {
  const units = typeof m.units === 'string' || typeof m.units === 'number' ? Number(m.units) : 0;
  const nanos = typeof m.nanos === 'number' ? m.nanos / 1e9 : 0;
  const amount = units + nanos;
  const currency = typeof m.currencyCode === 'string' ? m.currencyCode : '';
  return currency ? `${amount.toFixed(2)} ${currency}` : amount.toFixed(2);
}

function extractPlainText(doc: DocumentAiDocument | null | undefined): string {
  const text = typeof doc?.text === 'string' ? doc.text : '';
  if (!text) return '';
  return text.replace(/\u0000/g, '').trim();
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

/**
 * Extrae detalles legibles del error que devuelve el cliente gRPC de Google.
 * Los errores de la biblioteca @google-cloud/ tienen .code (número gRPC) y
 * .details (string) además de .message.
 */
function extractGoogleErrorDetail(err: unknown): {
  message: string;
  code: number | string | undefined;
  details: string | undefined;
  grpcStatus: string | undefined;
  hint: string;
} {
  if (!(err instanceof Error)) {
    return {
      message: String(err),
      code: undefined,
      details: undefined,
      grpcStatus: undefined,
      hint: 'Error desconocido (no es instancia de Error).',
    };
  }

  const raw = err as Error & { code?: number; details?: string; metadata?: unknown };
  const code = raw.code;
  const details = raw.details ?? undefined;

  // Mapear código gRPC a causa probable
  const grpcMap: Record<number, string> = {
    1: 'CANCELLED — solicitud cancelada',
    2: 'UNKNOWN — error desconocido en el servidor',
    3: 'INVALID_ARGUMENT — parámetro inválido (processorId, location o mimeType incorrecto)',
    4: 'DEADLINE_EXCEEDED — timeout; el archivo puede ser demasiado grande o lento',
    5: 'NOT_FOUND — recurso no encontrado (processorId o projectId incorrecto)',
    7: 'PERMISSION_DENIED — credenciales sin permisos o proyecto incorrecto',
    8: 'RESOURCE_EXHAUSTED — cuota agotada',
    12: 'UNIMPLEMENTED — operación no soportada por el procesador',
    13: 'INTERNAL — error interno de Google',
    14: 'UNAVAILABLE — servicio no disponible (región incorrecta o temporalmente caído)',
    16: 'UNAUTHENTICATED — credenciales inválidas o expiradas',
  };
  const grpcStatus = typeof code === 'number' ? grpcMap[code] : undefined;

  const hint =
    grpcStatus ??
    (raw.message.toLowerCase().includes('permission')
      ? 'PERMISSION_DENIED — revisa el serviceAccount y los roles IAM'
      : raw.message.toLowerCase().includes('not found')
        ? 'NOT_FOUND — revisa projectId, location y processorId'
        : raw.message.toLowerCase().includes('invalid')
          ? 'INVALID_ARGUMENT — revisa mimeType, processorId o location'
          : 'Revisa credenciales, región y processorId en Vercel.');

  return { message: raw.message, code, details, grpcStatus, hint };
}

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
 * Comprueba credenciales + región + processorId llamando a getProcessor (sin subir archivo).
 * Misma validación que hace la consola de Google al abrir el procesador.
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

  const projectIdForResource = lastResolvedProjectIdForDocumentAi ?? env.projectId;
  const processorPath = `projects/${projectIdForResource}/locations/${env.location}/processors/${env.processorId}`;

  try {
    const client = getClient(env);
    const [processor] = await client.getProcessor({ name: processorPath });
    return {
      ok: true,
      processorPath,
      processorDisplayName: processor.displayName ?? undefined,
      processorType: processor.type ?? undefined,
      state: processor.state != null ? String(processor.state) : undefined,
    };
  } catch (e) {
    const detail = extractGoogleErrorDetail(e);
    return {
      ok: false,
      processorPath,
      error: detail.message,
      hint: detail.hint,
      googleCode: detail.code,
    };
  }
}

export async function processDocumentAi(
  fileBytes: Buffer,
  mimeType: string,
): Promise<DocumentAiResult> {
  // ── Validar MIME antes de llamar a Google ──────────────────────────────────
  if (!DOCUMENT_AI_SUPPORTED_MIMES.has(mimeType)) {
    const err = new Error(
      `document_ai_mime_not_supported: el formato "${mimeType}" no es compatible con Document AI. ` +
        'Usa image/jpeg, image/png, image/webp, image/tiff o application/pdf.',
    );
    console.error('[document-ai] MIME no soportado:', mimeType);
    throw err;
  }

  const env = readEnvOrThrow();

  // ── Validar variables de entorno ───────────────────────────────────────────
  const missingEnvs: string[] = [];
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) missingEnvs.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim()) missingEnvs.push('GOOGLE_DOCUMENT_AI_LOCATION');
  if (!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim()) missingEnvs.push('GOOGLE_DOCUMENT_AI_PROCESSOR_ID');
  if (!process.env.GOOGLE_CLOUD_PROJECT_ID?.trim()) {
    // Puede estar en el JSON del service account; si env.projectId está resuelto, está bien
    if (!env.projectId) missingEnvs.push('GOOGLE_CLOUD_PROJECT_ID (o project_id en el JSON)');
  }
  if (missingEnvs.length > 0) {
    const msg = `document_ai_config_missing: faltan variables de entorno: ${missingEnvs.join(', ')}`;
    console.error('[document-ai]', msg);
    throw new Error(msg);
  }

  const client = getClient(env);
  const projectIdForResource = lastResolvedProjectIdForDocumentAi ?? env.projectId;
  const name = `projects/${projectIdForResource}/locations/${env.location}/processors/${env.processorId}`;

  // ── Log detallado pre-llamada ──────────────────────────────────────────────
  const fileSizeKb = Math.round(fileBytes.length / 1024);
  console.info(
    '[document-ai] pre-call',
    JSON.stringify({
      mimeType,
      fileSizeKb,
      fileSizeBytes: fileBytes.length,
      projectId: projectIdForResource,
      location: env.location,
      processorId: env.processorId,
      processorPath: name,
    }),
  );

  const t0 = Date.now();
  let response;
  try {
    [response] = await client.processDocument({
      name,
      rawDocument: {
        content: fileBytes,
        mimeType,
      },
    });
  } catch (googleErr) {
    const detail = extractGoogleErrorDetail(googleErr);
    const durationMs = Date.now() - t0;

    console.error(
      '[document-ai] ERROR de Google',
      JSON.stringify({
        message: detail.message,
        code: detail.code,
        grpcStatus: detail.grpcStatus,
        details: detail.details,
        hint: detail.hint,
        durationMs,
        processorPath: name,
        mimeType,
        fileSizeKb,
      }),
    );

    // Lanzar error enriquecido para que los handlers HTTP lo propaguen
    const enriched = new Error(
      `document_ai_google_error: ${detail.message} | code=${detail.code ?? 'n/a'} | hint=${detail.hint}`,
    );
    (enriched as Error & { googleCode?: number | string; googleDetails?: string; googleHint?: string }).googleCode = detail.code;
    (enriched as Error & { googleDetails?: string }).googleDetails = detail.details;
    (enriched as Error & { googleHint?: string }).googleHint = detail.hint;
    throw enriched;
  }

  const durationMs = Date.now() - t0;
  const doc = response.document;
  const plainText = extractPlainText(doc);
  const entities = (doc?.entities ?? []).map(flattenEntity);
  const pageCount = doc?.pages?.length ?? 0;

  console.info(
    '[document-ai] OK',
    JSON.stringify({ durationMs, pageCount, plainTextLen: plainText.length, entities: entities.length }),
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
