export type ActionUrgency = 'high' | 'medium' | 'low';

export type WeeklyAction = {
  id: string;
  urgency: ActionUrgency;
  title: string;
  reason: string;
  impact: string;
  estimatedTime: string;
};

/** Temas recurrentes en reseñas (entrada mínima para generar acciones). */
export type ReviewThemeSignal = {
  theme: string;
  mentionCount: number;
  avgSentiment?: number;
};

export type GenerateWeeklyActionPlanInput = {
  themes: ReviewThemeSignal[];
  minMentions?: number;
};

const DEFAULT_MIN_MENTIONS = 2;

function urgencyFromMentions(count: number): ActionUrgency {
  if (count >= 5) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

function slugId(theme: string, index: number): string {
  const base = theme
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `weekly-${base || 'action'}-${index}`;
}

/**
 * Convierte temas de reseñas en hasta 3 acciones semanales priorizadas.
 * Sin temas suficientes devuelve [] (la UI muestra estado vacío).
 */
export function generateWeeklyActionPlan(input: GenerateWeeklyActionPlanInput): WeeklyAction[] {
  const minMentions = input.minMentions ?? DEFAULT_MIN_MENTIONS;
  const ranked = [...input.themes]
    .filter((t) => t.theme.trim() && t.mentionCount >= minMentions)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 3);

  return ranked.map((theme, index) => {
    const urgency = urgencyFromMentions(theme.mentionCount);
    const label = theme.theme.trim();
    return {
      id: slugId(label, index),
      urgency,
      title: `Mejorar ${label}`,
      reason: `${theme.mentionCount} clientes mencionan “${label}” en reseñas recientes.`,
      impact:
        urgency === 'high'
          ? 'Alto — tema muy repetido en la experiencia'
          : urgency === 'medium'
            ? 'Medio — conviene corregir antes de que escale'
            : 'Mantenimiento — refuerzo preventivo',
      estimatedTime: urgency === 'high' ? '30–45 min' : urgency === 'medium' ? '20–30 min' : '15 min',
    };
  });
}
