export type ServicioCourse = 'entrantes' | 'principales' | 'postres';

export type DishStatus = 'listo' | 'preparacion';

/** Claves compactas para iconos en tarjeta. */
export type AllergenKey = 'gluten' | 'lactosa' | 'huevos' | 'frutos_secos' | 'soja' | 'pescado' | 'moluscos';

export type ServicioStep = {
  n: number;
  text: string;
  /** Miniatura opcional (WebP remoto optimizado). */
  imageUrl?: string;
};

export type ServicioIngredient = { name: string; qty: string };

export type ServicioDish = {
  id: string;
  name: string;
  shortDesc: string;
  course: ServicioCourse;
  portions: number;
  allergens: AllergenKey[];
  status: DishStatus;
  imageUrl: string;
  totalTimeMin: number;
  difficulty: 'facil' | 'media';
  costeRacionEuro?: number;
  pvpEuro?: number;
  steps: ServicioStep[];
  ingredients: ServicioIngredient[];
};

export type MiseItem = {
  id: string;
  text: string;
  qty: string;
};

export type ServicioDayBundle = {
  dishes: ServicioDish[];
  mise: MiseItem[];
};
