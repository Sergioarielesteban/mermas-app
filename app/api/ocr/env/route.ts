/** Temporal: comprobar envs OCR en runtime (Vercel). Eliminar cuando el lector funcione. */
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    project: !!process.env.GOOGLE_PROJECT_ID,
    processor: !!process.env.GOOGLE_PROCESSOR_ID,
    region: process.env.GOOGLE_REGION,
    hasCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    app: {
      GOOGLE_CLOUD_PROJECT_ID: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
      GOOGLE_DOCUMENT_AI_PROCESSOR_ID: !!process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
      GOOGLE_DOCUMENT_AI_LOCATION: process.env.GOOGLE_DOCUMENT_AI_LOCATION ?? null,
      GOOGLE_SERVICE_ACCOUNT_JSON: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    },
  });
}
