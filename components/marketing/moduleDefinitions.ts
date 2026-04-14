import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Flame,
  MessageCircle,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Timer,
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
    summary: 'Lo que pides y lo que llega, sin perder el hilo.',
    Icon: ShoppingCart,
    detailIntro: 'Un solo sitio para pedidos por proveedor y recepción. El turno que entra ve lo mismo que el que sale.',
    benefits: [
      'Pedidos y líneas claras, sin depender del cuaderno.',
      'Incidencias en recepción anotadas al momento.',
      'Menos “¿esto quién lo pidió?” entre turnos.',
    ],
    realCase: 'Falta una caja o viene mal: queda registrado al instante, no se pierde en el chat.',
    result: 'Menos errores y menos dinero en el aire.',
  },
  {
    id: 'mermas',
    title: 'Mermas',
    summary: 'Lo que tiras, medido. Motivo y coste en segundos.',
    Icon: Flame,
    detailIntro: 'Registro rápido desde el móvil: de la intuición a números que puedes revisar.',
    benefits: [
      'Motivo en cada registro, no solo “se ha tirado”.',
      'Coste aproximado para ver el impacto.',
      'Historial para ajustar compras y elaboración.',
    ],
    realCase: 'Caducidad o mala conservación: en unos toques sabes cuánto y por qué.',
    result: 'Menos sorpresas a final de mes.',
  },
  {
    id: 'appcc',
    title: 'APPCC',
    summary: 'Limpieza, temperaturas de frío, aceite y el historial cuando lo pidan.',
    Icon: ShieldCheck,
    detailIntro:
      'Un solo bloque para el programa: neveras y congeladores por turno, cambios y filtrados de aceite por freidora, y limpieza con categorías, instrucciones por tarea e historial por día.',
    benefits: [
      'Frío: mañana/noche, equipos claros, sin cuaderno suelto.',
      'Aceite: trazabilidad por freidora, historial y exportación cuando haga falta.',
      'Limpieza: el “cómo” por tarea y registro por turno para inspecciones.',
    ],
    realCase:
      'Visita o auditoría: temperaturas, aceite y programa de limpieza en el mismo sitio, sin rearmar carpetas.',
    result: 'Constancia seria sin frenar al equipo.',
  },
  {
    id: 'inventario',
    title: 'Inventario',
    summary: 'Stock y valor por local, desde el móvil.',
    Icon: ClipboardList,
    detailIntro: 'Catálogo, cantidades y cierres pensados para tablet o móvil, no para un Excel eterno.',
    benefits: [
      'Valor aproximado del stock para decidir con números.',
      'Historial de cierres antes de cambios fuertes.',
      'Menos “creo que hay…” y más dato compartido.',
    ],
    realCase: 'Cierre mensual: todos ven el mismo total, sin versiones sueltas.',
    result: 'Mejor control del producto parado.',
  },
  {
    id: 'escandallos',
    title: 'Escandallos',
    summary: 'Coste de plato, food cost y mix con datos reales.',
    Icon: Scale,
    detailIntro: 'Recetas, sub-recetas, PVP e importación de ventas por código TPV cuando lo enlazas.',
    benefits: [
      'Coste por ración alineado con cómo cocináis.',
      'Food cost y centro de mando con gráficas.',
      'Ventas del mes para comparar teórico vs mix real.',
    ],
    realCase: 'Sube un ingrediente: ves el impacto en el plato y en el margen.',
    result: 'Carta más coherente con la rentabilidad.',
  },
  {
    id: 'chat',
    title: 'Chat del local',
    summary: 'Avisos del equipo dentro de la app.',
    Icon: MessageCircle,
    detailIntro: 'Un hilo por local: coordinación sin multiplicar grupos externos.',
    benefits: [
      'Cada sede en su conversación.',
      'Contexto operativo junto al resto de herramientas.',
      'Ideal para avisos entre turnos.',
    ],
    realCase: 'Cambia una entrega o falta producto: lo ven al abrir la app.',
    result: 'Menos ruido y mejor coordinación.',
  },
  {
    id: 'horarios',
    title: 'Horarios',
    summary: 'Próximamente',
    Icon: CalendarDays,
    detailIntro:
      'Estamos cerrando este módulo para quien necesita cuadrar turnos con el ritmo real del servicio, sin vivir del grupo de WhatsApp.',
    benefits: [
      'Calendario y relevos compartidos: el equipo ve el mismo cuadre.',
      'Menos “¿quién entra hoy?” cuando hay baja o cambio de última hora.',
      'Avísanos si es tu prioridad: sube en la lista.',
    ],
    realCase: 'Refuerzo o sustitución: el turno mira la app y sabe quién cubre, sin llamadas en cadena.',
    result: 'Menos improvisación cuando el equipo rota.',
  },
  {
    id: 'fichaje',
    title: 'Fichaje',
    summary: 'Próximamente',
    Icon: Timer,
    detailIntro:
      'Estamos cerrando este módulo para fichar desde el móvil en pocos toques: claro para el equipo y ordenado si hay que revisar horas.',
    benefits: [
      'Entrada y salida sin papel suelto ni colas al terminar el servicio.',
      'Encaja con horarios cuando ambos módulos estén activos en tu local.',
      'Avísanos si es tu prioridad: sube en la lista.',
    ],
    realCase: 'Cierre de noche: marcas la salida en segundos y te vas, sin despacho intermedio.',
    result: 'Horas registradas sin robar minutos al pasillo.',
  },
  {
    id: 'cocina-central',
    title: 'Cocina central',
    summary: 'Próximamente',
    Icon: Building2,
    detailIntro: 'Estamos cerrando este módulo para quien elabora en un punto y sirve a varios locales.',
    benefits: [
      'Hoja de ruta compartida con clientes que ya piden escala.',
      'Menos grupos de WhatsApp por cada envío.',
      'Avísanos si es tu prioridad: sube en la lista.',
    ],
    realCase: 'Central prepara lotes y cada local ve qué le toca, con cambios reflejados para todos.',
    result: 'Menos fricción cuando creces.',
  },
];
