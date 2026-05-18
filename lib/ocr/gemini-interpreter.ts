/**
 * Capa de interpretación con Gemini.
 *
 * Recibe la salida cruda de Document AI (texto + entidades) y produce
 * un `AlbaranOcrPayload` tipado y validado.
 *
 * Uso de `responseSchema` para forzar JSON estructurado — evitamos hacks
 * de parsing libre. Si la respuesta no cumple, propagamos error.
 *
 * NUNCA se llama desde el cliente.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { logSecurityEvent } from '@/lib/server/security-log';
import type {
  AlbaranOcrPayload,
  AlbaranOcrLine,
  AlbaranOcrUnit,
  OcrConfidence,
} from '@/lib/ocr/types-document';
import type { DocumentAiRawEntity } from '@/lib/ocr/providers/document-ai';

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-preview-05-20';

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim();
}

const ALLOWED_UNITS: AlbaranOcrUnit[] = [
  'kg',
  'ud',
  'caja',
  'bolsa',
  'paquete',
  'bandeja',
  'racion',
  'g',
  'l',
  'ml',
];

const ALLOWED_CONFIDENCES: OcrConfidence[] = ['low', 'medium', 'high'];

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    supplier: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, nullable: true },
        cif: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true },
        confidence: { type: Type.STRING, enum: ALLOWED_CONFIDENCES },
      },
      required: ['confidence'],
    },
    document: {
      type: Type.OBJECT,
      properties: {
        number: { type: Type.STRING, nullable: true },
        date: { type: Type.STRING, nullable: true, description: 'YYYY-MM-DD' },
        orderReference: { type: Type.STRING, nullable: true },
        paymentTerms: { type: Type.STRING, nullable: true },
        confidence: { type: Type.STRING, enum: ALLOWED_CONFIDENCES },
      },
      required: ['confidence'],
    },
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rawText: { type: Type.STRING },
          supplierProductCode: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER, nullable: true },
          unit: { type: Type.STRING, enum: ALLOWED_UNITS, nullable: true },
          unitPrice: { type: Type.NUMBER, nullable: true },
          lineTotal: { type: Type.NUMBER, nullable: true },
          vatRate: { type: Type.NUMBER, nullable: true },
          discountPct: { type: Type.NUMBER, nullable: true },
          weightKg: { type: Type.NUMBER, nullable: true },
          confidence: { type: Type.STRING, enum: ALLOWED_CONFIDENCES },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['rawText', 'description', 'confidence', 'warnings'],
      },
    },
    totals: {
      type: Type.OBJECT,
      properties: {
        subtotal: { type: Type.NUMBER, nullable: true },
        taxAmount: { type: Type.NUMBER, nullable: true },
        taxRate: { type: Type.NUMBER, nullable: true },
        discountAmount: { type: Type.NUMBER, nullable: true },
        total: { type: Type.NUMBER, nullable: true },
        confidence: { type: Type.STRING, enum: ALLOWED_CONFIDENCES },
      },
      required: ['confidence'],
    },
    observations: { type: Type.STRING },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['supplier', 'document', 'lines', 'totals', 'observations', 'warnings'],
} as const;

const SYSTEM_INSTRUCTION = `Eres un asistente OCR especializado en albaranes de proveedores españoles de hostelería (alimentación, bebidas, limpieza).
Tu tarea: convertir texto OCR + entidades en un JSON estructurado siguiendo el schema.

Reglas estrictas:
- Devuelve SOLO JSON válido conforme al schema. No añadas comentarios ni texto fuera.
- Si un dato no aparece o es ilegible, devuelve null (no inventes).
- Fechas SIEMPRE en formato YYYY-MM-DD. Si el documento usa formato DD/MM/YYYY o similar, conviértelo. Si la fecha es ambigua, devuelve null.
- Importes en EUR como números decimales con punto (no coma). Sin símbolo €.
- Unidades permitidas: kg, ud, caja, bolsa, paquete, bandeja, racion, g, l, ml. Si la unidad no aparece o es indeterminada, devuelve null.
- Si un producto se vende por caja pero el documento muestra peso (kg), pon \`unit\` = "caja", \`quantity\` = nº de cajas, y \`weightKg\` = el peso total. NUNCA mezcles unidades.
- Confidence ('low'|'medium'|'high'): refleja certeza propia, no del OCR de origen. Usa 'low' si hay dudas.
- En \`warnings\` de cada línea anota dudas concretas: "precio sospechoso", "código ilegible", "cantidad estimada", etc.
- En \`warnings\` global anota inconsistencias del documento: "subtotal no cuadra con suma de líneas", "fecha futura", "duplicado posible", etc.
- IVA: si solo aparece IVA en cabecera, ponlo en totals.taxRate. Si aparece por línea, ponlo en lines[].vatRate.
- Descuentos: discountPct es el porcentaje (ej. 5 para 5%), no la cantidad.
- observations: notas humanas breves útiles para revisión (ej. "Albarán manuscrito en parte inferior", "Falta firma proveedor").
- NO inventes proveedores ni números de albarán: si no son claros, deja null.`;

function clampUnit(v: unknown): AlbaranOcrUnit | null {
  if (typeof v !== 'string') return null;
  return (ALLOWED_UNITS as readonly string[]).includes(v) ? (v as AlbaranOcrUnit) : null;
}

function clampConfidence(v: unknown, fallback: OcrConfidence = 'medium'): OcrConfidence {
  if (typeof v !== 'string') return fallback;
  return (ALLOWED_CONFIDENCES as readonly string[]).includes(v)
    ? (v as OcrConfidence)
    : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
}

function entitiesToCompactText(entities: DocumentAiRawEntity[]): string {
  if (!entities.length) return '';
  return entities
    .map((e) => {
      const value = e.normalizedValue || e.text;
      const props = (e.properties ?? [])
        .map((p) => `${p.type}=${p.normalizedValue || p.text}`)
        .join(' | ');
      return `${e.type}: ${value}${props ? ` { ${props} }` : ''} (conf ${e.confidence.toFixed(2)})`;
    })
    .join('\n');
}

/**
 * Interpreta la salida cruda de Document AI con Gemini y devuelve `AlbaranOcrPayload`.
 *
 * @throws Error con códigos:
 *   - `gemini_not_configured` si no hay API key.
 *   - `gemini_invalid_response` si la respuesta no es JSON válido o no encaja.
 */
export async function interpretAlbaranWithGemini(input: {
  ocrText: string;
  entities: DocumentAiRawEntity[];
  documentAiProcessor: string;
  documentAiDurationMs: number;
  pageCount: number;
  mimeType: string;
}): Promise<AlbaranOcrPayload> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    logSecurityEvent('critical', { ocr: 'gemini_not_configured' });
    throw new Error('gemini_not_configured');
  }

  const ai = new GoogleGenAI({ apiKey });

  const userPrompt = `Texto OCR (Document AI):
${input.ocrText.slice(0, 32000)}

Entidades detectadas:
${entitiesToCompactText(input.entities).slice(0, 12000)}

Devuelve el JSON estructurado del albarán siguiendo el schema indicado en las instrucciones de sistema.`;

  const t0 = Date.now();
  let rawText: string;
  try {
    const res = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });
    rawText = res.text ?? '';
  } catch (e) {
    logSecurityEvent('critical', {
      ocr: 'gemini_call_failed',
      error: e instanceof Error ? e.message : 'unknown',
    });
    throw new Error('gemini_call_failed');
  }
  const geminiDurationMs = Date.now() - t0;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    logSecurityEvent('critical', { ocr: 'gemini_invalid_json' });
    throw new Error('gemini_invalid_response');
  }

  const supplier = (parsed.supplier ?? {}) as Record<string, unknown>;
  const document = (parsed.document ?? {}) as Record<string, unknown>;
  const totals = (parsed.totals ?? {}) as Record<string, unknown>;
  const linesRaw = Array.isArray(parsed.lines) ? (parsed.lines as Record<string, unknown>[]) : [];

  const lines: AlbaranOcrLine[] = linesRaw.map((l) => ({
    rawText: strOrNull(l.rawText) ?? '',
    supplierProductCode: strOrNull(l.supplierProductCode),
    description: strOrNull(l.description) ?? '',
    quantity: numOrNull(l.quantity),
    unit: clampUnit(l.unit),
    unitPrice: numOrNull(l.unitPrice),
    lineTotal: numOrNull(l.lineTotal),
    vatRate: numOrNull(l.vatRate),
    discountPct: numOrNull(l.discountPct),
    weightKg: numOrNull(l.weightKg),
    confidence: clampConfidence(l.confidence),
    warnings: strList(l.warnings),
  }));

  const payload: AlbaranOcrPayload = {
    provider: 'document-ai+gemini',
    supplier: {
      name: strOrNull(supplier.name),
      cif: strOrNull(supplier.cif),
      email: strOrNull(supplier.email),
      phone: strOrNull(supplier.phone),
      confidence: clampConfidence(supplier.confidence),
    },
    document: {
      number: strOrNull(document.number),
      date: strOrNull(document.date),
      orderReference: strOrNull(document.orderReference),
      paymentTerms: strOrNull(document.paymentTerms),
      confidence: clampConfidence(document.confidence),
    },
    lines,
    totals: {
      subtotal: numOrNull(totals.subtotal),
      taxAmount: numOrNull(totals.taxAmount),
      taxRate: numOrNull(totals.taxRate),
      discountAmount: numOrNull(totals.discountAmount),
      total: numOrNull(totals.total),
      confidence: clampConfidence(totals.confidence),
    },
    observations: strOrNull(parsed.observations) ?? '',
    ocrText: input.ocrText,
    warnings: strList(parsed.warnings),
    meta: {
      documentAiProcessor: input.documentAiProcessor,
      geminiModel: DEFAULT_MODEL,
      documentAiDurationMs: input.documentAiDurationMs,
      geminiDurationMs,
      totalDurationMs: 0,
      pageCount: input.pageCount,
      mimeType: input.mimeType,
    },
  };

  return payload;
}
