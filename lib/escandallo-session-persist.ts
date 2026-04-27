import type { IngredientDraftRow } from '@/lib/escandallos-recipe-draft-utils';

const WIZARD_KEY = 'escandallo-new-recipe-wizard-v1';

export type EscandalloWizardPersistV1 = {
  v: 1;
  localId: string;
  step: number;
  name: string;
  yieldQty: string;
  yieldLabel: string;
  saleGross: string;
  saleVat: string;
  ingredientDrafts: IngredientDraftRow[];
  updatedAt: number;
};

export function readEscandalloWizardDraft(localId: string): EscandalloWizardPersistV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as EscandalloWizardPersistV1;
    if (p?.v !== 1 || p.localId !== localId) return null;
    if (typeof p.step !== 'number' || p.step < 0 || p.step > 3) return null;
    if (!Array.isArray(p.ingredientDrafts)) return null;
    return p;
  } catch {
    return null;
  }
}

export function writeEscandalloWizardDraft(data: EscandalloWizardPersistV1): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function clearEscandalloWizardDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WIZARD_KEY);
  } catch {
    /* ignore */
  }
}

const recipeEditorKey = (localId: string, recipeId: string) =>
  `escandallo-recipe-editor-draft-v1:${localId}:${recipeId}`;

export type EscandalloRecipeEditorPersistV1 = {
  v: 1;
  localId: string;
  recipeId: string;
  draftRecipeName: string;
  draftRecipeNotes: string;
  draftYieldQty: string;
  draftYieldLabel: string;
  draftSaleGross: string;
  draftSaleVat: string;
  draftPosArticleCode: string;
  draftFinalWeightQty?: string;
  draftFinalWeightUnit?: 'kg' | 'l';
  ingredientDrafts: IngredientDraftRow[];
  updatedAt: number;
};

export function readEscandalloRecipeEditorDraft(
  localId: string,
  recipeId: string,
): EscandalloRecipeEditorPersistV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(recipeEditorKey(localId, recipeId));
    if (!raw) return null;
    const p = JSON.parse(raw) as EscandalloRecipeEditorPersistV1;
    if (p?.v !== 1 || p.localId !== localId || p.recipeId !== recipeId) return null;
    if (!Array.isArray(p.ingredientDrafts)) return null;
    return p;
  } catch {
    return null;
  }
}

export function writeEscandalloRecipeEditorDraft(data: EscandalloRecipeEditorPersistV1): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(recipeEditorKey(data.localId, data.recipeId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function clearEscandalloRecipeEditorDraft(localId: string, recipeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(recipeEditorKey(localId, recipeId));
  } catch {
    /* ignore */
  }
}
