/**
 * GET /api/ocr/diagnose
 *
 * Diagnóstico seguro de la integración OCR (sin secretos en la respuesta).
 * Comprueba variables de entorno, parseo del JSON de cuenta de servicio y
 * conectividad con el processor de Document AI (getProcessor).
 *
 * Requiere sesión Supabase (mismo auth que el resto de OCR).
 */

import { NextResponse } from 'next/server';
import { requireAllowedSupabaseUser } from '@/lib/require-allowed-supabase-user';
import {
  DOCUMENT_AI_ENV_KEYS,
  isDocumentAiConfigured,
  logOcrIntegrationDiagnostics,
  verifyDocumentAiProcessor,
} from '@/lib/ocr/providers/document-ai';
import { isGeminiConfigured } from '@/lib/ocr/gemini-interpreter';

export const runtime = 'nodejs';
export const maxDuration = 30;

function envPresent(name: string): boolean {
  return Boolean((process.env[name] ?? '').trim());
}

export async function GET(request: Request) {
  const auth = await requireAllowedSupabaseUser(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: auth.status });
  }

  logOcrIntegrationDiagnostics({ endpoint: 'GET /api/ocr/diagnose' });

  const documentAiEnv = {
    GOOGLE_CLOUD_PROJECT_ID: envPresent('GOOGLE_CLOUD_PROJECT_ID'),
    GOOGLE_DOCUMENT_AI_LOCATION: process.env.GOOGLE_DOCUMENT_AI_LOCATION?.trim() || null,
    GOOGLE_DOCUMENT_AI_PROCESSOR_ID: envPresent('GOOGLE_DOCUMENT_AI_PROCESSOR_ID'),
    GOOGLE_SERVICE_ACCOUNT_JSON: envPresent('GOOGLE_SERVICE_ACCOUNT_JSON'),
  };

  const geminiEnv = {
    GEMINI_API_KEY: envPresent('GEMINI_API_KEY'),
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash-001 (default)',
  };

  const configured = {
    documentAi: isDocumentAiConfigured(),
    gemini: isGeminiConfigured(),
  };

  let processorCheck: Awaited<ReturnType<typeof verifyDocumentAiProcessor>> | null = null;
  if (configured.documentAi) {
    processorCheck = await verifyDocumentAiProcessor();
  }

  const blockingIssues: string[] = [];

  if (!documentAiEnv.GOOGLE_SERVICE_ACCOUNT_JSON) {
    blockingIssues.push('Falta GOOGLE_SERVICE_ACCOUNT_JSON en Vercel (pega el JSON completo de la cuenta de servicio).');
  }
  if (!documentAiEnv.GOOGLE_DOCUMENT_AI_PROCESSOR_ID) {
    blockingIssues.push('Falta GOOGLE_DOCUMENT_AI_PROCESSOR_ID (solo el ID, no la ruta projects/...).');
  }
  if (!documentAiEnv.GOOGLE_DOCUMENT_AI_LOCATION) {
    blockingIssues.push('Falta GOOGLE_DOCUMENT_AI_LOCATION (ej. eu o us, igual que en la consola de Document AI).');
  }
  if (!documentAiEnv.GOOGLE_CLOUD_PROJECT_ID && configured.documentAi) {
    blockingIssues.push(
      'GOOGLE_CLOUD_PROJECT_ID vacío — se usa project_id del JSON; confirma que sea el mismo proyecto que el processor.',
    );
  }
  if (!geminiEnv.GEMINI_API_KEY) {
    blockingIssues.push('Falta GEMINI_API_KEY (Document AI puede funcionar pero /api/ocr/process fallará en el paso Gemini).');
  }
  if (processorCheck && !processorCheck.ok) {
    blockingIssues.push(
      processorCheck.hint ??
        processorCheck.error ??
        'No se pudo contactar con el processor de Document AI.',
    );
  }

  const readyForOcrProcess = configured.documentAi && configured.gemini && processorCheck?.ok === true;

  return NextResponse.json({
    ok: readyForOcrProcess,
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    envKeyNames: DOCUMENT_AI_ENV_KEYS,
    documentAiEnv,
    geminiEnv,
    configured,
    processorCheck,
    blockingIssues,
    nextSteps: readyForOcrProcess
      ? ['La configuración parece correcta. Si un archivo concreto falla, revisa formato (JPG/PNG/PDF) y tamaño (< 8 MB).']
      : [
          '1. En Vercel → Settings → Environment Variables, crea las 5 variables con los nombres exactos de envKeyNames.',
          '2. GOOGLE_CLOUD_PROJECT_ID = chef-one-our (o tu project_id del JSON).',
          '3. GOOGLE_DOCUMENT_AI_LOCATION = misma región que el processor en Console (eu o us).',
          '4. GOOGLE_DOCUMENT_AI_PROCESSOR_ID = ID del processor (pestaña del processor en Console).',
          '5. GOOGLE_SERVICE_ACCOUNT_JSON = contenido completo del JSON (una sola variable; Vercel admite multilínea).',
          '6. GEMINI_API_KEY = clave de Google AI Studio.',
          '7. Redeploy tras guardar variables.',
        ],
  });
}
