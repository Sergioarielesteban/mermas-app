import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ClipboardList,
  Flame,
  MessageCircle,
  Scale,
  ShoppingCart,
  Thermometer,
} from 'lucide-react';

export type MarketingModuleDefinition = {
  id: string;
  title: string;
  summary: string;
  Icon: LucideIcon;
  detailIntro: string;
  benefits: [string, string, string];
  realCase: string;
  result: string;
};

export const MARKETING_MODULES: MarketingModuleDefinition[] = [
  {
    id: 'pedidos',
    title: 'Pedidos y recepción',
    summary: 'Todo lo que se pide, llega y se revisa, en un solo sitio.',
    Icon: ShoppingCart,
    detailIntro:
      'Centraliza pedidos por proveedor y lo que ocurre en recepción. El equipo ve el mismo dato, esté quien esté al frente del turno.',
    benefits: [
      'Registra pedidos por proveedor y líneas, sin depender del cuaderno.',
      'Anota incidencias en recepción en el momento (faltas, calidad, errores).',
      'Evita malentendidos cuando cambian los turnos o falta quien suele decidir.',
    ],
    realCase:
      'Llega un pedido incompleto o con errores y queda registrado al instante, sin perder el hilo en WhatsApp o en papel.',
    result: 'Más control, menos errores y menos dinero perdido por desorganización.',
  },
  {
    id: 'mermas',
    title: 'Mermas y residuos',
    summary: 'Lo que se tira deja de ser invisible: motivo, cantidad y coste.',
    Icon: Flame,
    detailIntro:
      'Registra mermas y residuos en segundos desde el móvil. Pasan de “intuición” a datos que el equipo puede revisar con calma.',
    benefits: [
      'Motivo y contexto en cada registro, no solo “se ha tirado”.',
      'Coste aproximado para ver el impacto en el margen.',
      'Historial consultable: útil para ajustar compras y elaboración.',
    ],
    realCase:
      'Un turno tira producto caducado o mal conservado: en unos toques queda cuánto, por qué y cuánto ha costado aproximadamente.',
    result: 'Menos sorpresas a final de mes y decisiones más basadas en hechos.',
  },
  {
    id: 'appcc',
    title: 'Puntos críticos (APPCC)',
    summary: 'Temperaturas, freidoras e historial listos para inspección.',
    Icon: Thermometer,
    detailIntro:
      'Sustituye cuadernos que no siempre se rellenan por registros guiados en dispositivo, con trazabilidad clara.',
    benefits: [
      'Registros de temperaturas y revisiones en flujos simples.',
      'Aceite de freidoras y otros puntos con historial ordenado.',
      'Menos estrés ante visitas: la información está agrupada y fechada.',
    ],
    realCase:
      'Antes de una inspección o auditoría interna, exportas o enseñas el historial sin rearmar carpetas.',
    result: 'Constancia operativa sin complicar al equipo en cocina.',
  },
  {
    id: 'inventario',
    title: 'Inventario y valoración',
    summary: 'Stock por local y visibilidad del valor que tienes en almacén y cocina.',
    Icon: ClipboardList,
    detailIntro:
      'Inventario pensado para operar desde móvil o tablet: catálogo, cantidades y cierres sin depender del Excel del despacho.',
    benefits: [
      'Valor aproximado del stock para tomar decisiones con números.',
      'Historial de cierres y copias de seguridad antes de cambios fuertes.',
      'Menos discrepancias entre lo que “crees” tener y lo que hay.',
    ],
    realCase:
      'Haces un cierre mensual o revisión rápida y todos ven el mismo inventario y total, sin versiones sueltas.',
    result: 'Mejor control del capital inmovilizado en producto.',
  },
  {
    id: 'chat',
    title: 'Chat interno por local',
    summary: 'Comunicación del equipo dentro de la app, sin depender de grupos externos.',
    Icon: MessageCircle,
    detailIntro:
      'Mensajes por local para coordinar turnos, avisos rápidos y seguimiento operativo desde el mismo panel.',
    benefits: [
      'Cada local conversa en su propio hilo, sin mezclar información.',
      'Más contexto operativo que en mensajes sueltos fuera de la app.',
      'Ideal para avisos cortos durante servicio o cambios de turno.',
    ],
    realCase:
      'Falta un producto o cambia una entrega: el equipo lo deja en el chat del local y todos lo ven al entrar.',
    result: 'Menos confusión interna y mejor coordinación del día a día.',
  },
  {
    id: 'escandallos',
    title: 'Escandallos',
    summary: 'Costes de plato y márgenes con lógica de cocina, no de hoja suelta.',
    Icon: Scale,
    detailIntro:
      'Estructura escandallos y recetas para entender coste por ración o por servicio, alineado con cómo trabajáis en realidad.',
    benefits: [
      'Ingredientes y mermas de elaboración reflejadas en el cálculo.',
      'Comparar versión “teórica” con lo que está pasando en operaciones.',
      'Base para ajustar precios de carta con criterio, no solo intuición.',
    ],
    realCase:
      'Sube un ingrediente clave: ves cómo afecta al coste del plato y puedes decidir carta o porción con datos.',
    result: 'Carta más coherente con la rentabilidad real.',
  },
  {
    id: 'cocina-central',
    title: 'Cocina central / producción',
    summary: 'Producción y reparto entre locales con el mismo hilo operativo.',
    Icon: Building2,
    detailIntro:
      'Para quien elabora en un punto y distribuye a varios sitios: menos desajustes entre lo producido y lo que pide cada local.',
    benefits: [
      'Visibilidad de producción y necesidades por destino.',
      'Menos errores de comunicación entre central y sedes.',
      'Escalable cuando creces sin multiplicar grupos de WhatsApp.',
    ],
    realCase:
      'La central prepara lotes y cada local sabe qué le corresponde; si hay cambio, queda reflejado para todos.',
    result: 'Operaciones más ordenadas y menos pérdida por falta de coordinación.',
  },
];
