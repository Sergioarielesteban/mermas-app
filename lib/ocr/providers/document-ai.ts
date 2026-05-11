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

export async function processDocumentAi(
  fileBytes: Buffer,
  mimeType: string,
): Promise<DocumentAiResult> {
  const env = readEnvOrThrow();
  const client = getClient(env);
  const projectIdForResource =
    lastResolvedProjectIdForDocumentAi ?? env.projectId;
  const name = `projects/${projectIdForResource}/locations/${env.location}/processors/${env.processorId}`;

  const t0 = Date.now();
  const [response] = await client.processDocument({
    name,
    rawDocument: {
      content: fileBytes,
      mimeType,
    },
  });
  const durationMs = Date.now() - t0;

  const doc = response.document;
  const plainText = extractPlainText(doc);
  const entities = (doc?.entities ?? []).map(flattenEntity);
  const pageCount = doc?.pages?.length ?? 0;

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
