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
  /** Id de línea de plan (home) o id de plato en vistas sin plan. */
  id: string;
  platoId: string;
  planLineId?: string;
  name: string;
  shortDesc: string;
  course: ServicioCourse;
  portions: number;
  allergens: AllergenKey[];
  status: DishStatus;
  imageUrl: string;
  totalTimeMin: number;
  difficulty: 'facil' | 'media' | 'alta';
  costeRacionEuro?: number;
  pvpEuro?: number;
  steps: ServicioStep[];
  ingredients: ServicioIngredient[];
  /** Solo catálogo / editor. */
  activo?: boolean;
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
