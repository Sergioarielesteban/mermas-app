import type { ServicioDayBundle, ServicioDish } from '@/lib/servicio/types';

/** Base WebP vía Unsplash (fit + calidad acotada; lazy en UI). */
function img(id: string, w = 640): string {
  return `https://images.unsplash.com/${id}?w=${w}&h=${Math.round(w * 0.75)}&fit=crop&q=72&auto=format&fm=webp`;
}

const DISHES: ServicioDish[] = [
  {
    id: 'ens-verde',
    platoId: 'ens-verde',
    name: 'Ensalada verde',
    shortDesc: 'Brotes, tomate cherry y vinagreta suave.',
    course: 'entrantes',
    portions: 42,
    allergens: ['gluten'],
    status: 'listo',
    imageUrl: img('photo-1512621776951-a57141f2eefd'),
    totalTimeMin: 25,
    difficulty: 'facil',
    costeRacionEuro: 1.2,
    pvpEuro: 4.5,
    steps: [
      { n: 1, text: 'Lavar brotes y tomates; escurrir muy bien.' },
      { n: 2, text: 'Mezclar aceite, vinagre, sal y pimienta en bol.' },
      { n: 3, text: 'Emplatar: lecho, tomate, vinagreta al momento.' },
    ],
    ingredients: [
      { name: 'Brotes', qty: '1,2 kg' },
      { name: 'Tomate cherry', qty: '800 g' },
      { name: 'Aceite / vinagre', qty: '200 ml' },
    ],
  },
  {
    id: 'tartar-salmon',
    platoId: 'tartar-salmon',
    name: 'Tartar de salmón',
    shortDesc: 'Corte fino, limón y eneldo; servir frío.',
    course: 'entrantes',
    portions: 28,
    allergens: ['pescado', 'soja', 'lactosa'],
    status: 'preparacion',
    imageUrl: img('photo-1546833999-b9f581a0911d'),
    totalTimeMin: 40,
    difficulty: 'media',
    costeRacionEuro: 3.4,
    pvpEuro: 9.5,
    steps: [
      { n: 1, text: 'Picar salmón en brunoise; mantener 0–4 °C.' },
      { n: 2, text: 'Mezclar con soja, limón y eneldo sin machacar.' },
      { n: 3, text: 'Aro en frío, galleta fina y brote encima.' },
    ],
    ingredients: [
      { name: 'Salmón', qty: '3,5 kg' },
      { name: 'Soja / limón', qty: '150 ml' },
      { name: 'Eneldo', qty: '1 manojo' },
    ],
  },
  {
    id: 'crema-calabaza',
    platoId: 'crema-calabaza',
    name: 'Crema de calabaza',
    shortDesc: 'Textura fina, toque de nata montada.',
    course: 'principales',
    portions: 36,
    allergens: ['lactosa'],
    status: 'listo',
    imageUrl: img('photo-1476718406336-bb5a9690ee2a'),
    totalTimeMin: 55,
    difficulty: 'facil',
    costeRacionEuro: 0.9,
    pvpEuro: 5.8,
    steps: [
      { n: 1, text: 'Pochar cebolla y calabaza en cubos.' },
      { n: 2, text: 'Cubrir de caldo; cocer 25 min hasta tierno.' },
      { n: 3, text: 'Triturar fino, ajustar sal y pasar chino.' },
      { n: 4, text: 'Terminar con nata batida en copa al salir.' },
    ],
    ingredients: [
      { name: 'Calabaza', qty: '6 kg' },
      { name: 'Caldo', qty: '5 L' },
      { name: 'Nata', qty: '400 ml' },
    ],
  },
  {
    id: 'bacalao-horno',
    platoId: 'bacalao-horno',
    name: 'Bacalao al horno',
    shortDesc: 'Con pisto de verduras y aceite de oliva.',
    course: 'principales',
    portions: 32,
    allergens: ['pescado'],
    status: 'preparacion',
    imageUrl: img('photo-1565557623262-b40a740c1f3e'),
    totalTimeMin: 70,
    difficulty: 'media',
    costeRacionEuro: 4.1,
    pvpEuro: 14,
    steps: [
      { n: 1, text: 'Desalar / descongelar según procedimiento del lote.' },
      { n: 2, text: 'Pisto en bandeja; bacalao encima, aceite y sal.' },
      { n: 3, text: 'Horno 180 °C — 14–16 min según grosor.' },
      { n: 4, text: 'Reposo 2 min; jugo al plato.' },
    ],
    ingredients: [
      { name: 'Lomos bacalao', qty: '4,5 kg' },
      { name: 'Pisto', qty: '3 L' },
      { name: 'Aceite AOVE', qty: '200 ml' },
    ],
  },
  {
    id: 'pollo-ajillo',
    platoId: 'pollo-ajillo',
    name: 'Pollo al ajillo',
    shortDesc: 'Muslo deshuesado, ajo laminado y vino blanco.',
    course: 'principales',
    portions: 40,
    allergens: [],
    status: 'preparacion',
    imageUrl: img('photo-1598103442097-8b74394b95c6'),
    totalTimeMin: 45,
    difficulty: 'facil',
    costeRacionEuro: 2.2,
    pvpEuro: 8.9,
    steps: [
      { n: 1, text: 'Marcar muslos en sartén ancha muy caliente.' },
      { n: 2, text: 'Añadir ajo laminado sin que queme.' },
      { n: 3, text: 'Vino blanco, reducir y terminar al horno 12 min.' },
    ],
    ingredients: [
      { name: 'Muslo pollo', qty: '6 kg' },
      { name: 'Ajo', qty: '150 g' },
      { name: 'Vino blanco', qty: '500 ml' },
    ],
  },
  {
    id: 'tarta-queso',
    platoId: 'tarta-queso',
    name: 'Tarta de queso',
    shortDesc: 'Cremosa, base galleta y frutos rojos.',
    course: 'postres',
    portions: 38,
    allergens: ['gluten', 'lactosa', 'huevos'],
    status: 'listo',
    imageUrl: img('photo-1565958011703-bfede58d2222'),
    totalTimeMin: 30,
    difficulty: 'facil',
    costeRacionEuro: 1.1,
    pvpEuro: 4.9,
    steps: [
      { n: 1, text: 'Base galleta prensada en molde; frío.' },
      { n: 2, text: 'Relleno batido; horno suave según receta interna.' },
      { n: 3, text: 'Frío mínimo 4 h; coulis al montar.' },
    ],
    ingredients: [
      { name: 'Queso crema', qty: '2,5 kg' },
      { name: 'Huevos', qty: '18 u' },
      { name: 'Frutos rojos', qty: '1,2 kg' },
    ],
  },
];

const MISE: ServicioDayBundle['mise'] = [
  { id: 'm1', text: 'Cortar tomates cherry', qty: '800 g' },
  { id: 'm2', text: 'Preparar vinagreta ensalada', qty: '1 L' },
  { id: 'm3', text: 'Picar salmón tartar (0–4 °C)', qty: '3,5 kg' },
  { id: 'm4', text: 'Cocer crema calabaza y pasar chino', qty: '6 L' },
  { id: 'm5', text: 'Pisto bacalao en bandejas', qty: '3 L' },
  { id: 'm6', text: 'Marinar / preparar muslos pollo', qty: '6 kg' },
  { id: 'm7', text: 'Base tarta + coulis frutos rojos', qty: '1,2 L' },
];

export function getServicioBundle(_dateKey: string): ServicioDayBundle {
  void _dateKey;
  return { dishes: DISHES, mise: MISE };
}

export function getDishById(id: string): ServicioDish | undefined {
  return DISHES.find((d) => d.id === id);
}

export function estimateServiceMinutes(dishes: ServicioDish[]): number {
  if (!dishes.length) return 0;
  const sum = dishes.reduce((a, d) => a + d.totalTimeMin, 0);
  return Math.max(35, Math.round(sum * 0.32));
}
