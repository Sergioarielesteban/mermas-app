import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Building2,
  CalendarDays,
  ClipboardList,
  Factory,
  Flame,
  ListChecks,
  MessageCircle,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Timer,
  UtensilsCrossed,
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
    summary: 'Lo que pides y lo que llega, sin perder el hilo. OCR de albarán cuando lo necesites.',
    Icon: ShoppingCart,
    detailIntro:
      'Un solo sitio para pedidos por proveedor y recepción. El turno que entra ve lo mismo que el que sale. Puedes escanear el albarán (foto o archivo): un motor OCR en la nube propone cantidades y precios para que los revises y apliques con un clic.',
    benefits: [
      'Pedidos y líneas claras, sin depender del cuaderno.',
      'Lector OCR de albarán para adelantar recepción; tú validas antes de guardar.',
      'Incidencias en recepción anotadas al momento.',
    ],
    realCase: 'Falta una caja o viene mal: queda registrado al instante, no se pierde en el chat.',
    result: 'Menos errores y menos dinero en el aire.',
  },
  {
    id: 'oido-chef',
    title: 'Oído Chef (asistente)',
    summary: 'Voz o texto: precios, limpieza, APPCC, pedidos. IA opcional y lectura de respuestas en voz natural.',
    Icon: Bot,
    detailIntro:
      'Asistente integrado en Pedidos: preguntas en lenguaje coloquial (“¿a qué precio compré la mantequilla esta semana?”, “limpieza hoy”, “estado APPCC”), accesos rápidos y dictado. Si configuras la API de OpenAI en tu despliegue, amplía el entendimiento y puedes usar voz neural para leer las respuestas. Los datos salen de lo que ya tienes cargado en la app.',
    benefits: [
      'Menos comandos rígidos: frases naturales y atajos con una palabra.',
      'Compatible con IA opcional (OpenAI) para consultas abiertas sobre tus pedidos.',
      'Texto a voz del navegador o voz natural OpenAI cuando lo actives.',
    ],
    realCase: 'El jefe pregunta al móvil qué pedidos van pendientes y qué toca limpiar hoy, sin abrir cinco pantallas.',
    result: 'Información operativa al momento, con menos curva de aprendizaje.',
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
    id: 'checklist',
    title: 'Check list operativa',
    summary: 'Apertura, cambio de turno, cierre e higiene: tus listas, tus ítems.',
    Icon: ListChecks,
    detailIntro:
      'Tú defines categorías y tareas; el equipo ejecuta listas por día o nota de turno, con historial por fecha. Es complementario al programa de limpieza APPCC: aquí va lo que quieras comprobar en checklist (cámara, cierre, uniformidad…).',
    benefits: [
      'Plantillas sugeridas solo orientan el tipo de lista; el contenido lo controlas tú.',
      'Historial de ejecuciones para auditorías y buenas prácticas.',
      'Flujo móvil pensado para marcar al vuelo.',
    ],
    realCase: 'Cambio de turno: la lista sale en el móvil, se marca lo hecho y queda registro.',
    result: 'Menos “¿esto se hizo?” y más trazabilidad sin papeles sueltos.',
  },
  {
    id: 'produccion',
    title: 'Producción',
    summary: 'Planes por zonas y cadencia: elaborados, cuarto frío, lo que nombréis vosotros.',
    Icon: Factory,
    detailIntro:
      'Organizas zonas con nombre libre, tareas bajo cada zona y cadencia (diaria, semanal…). Ejecución con fecha y etiqueta de periodo, más historial de corridas. Independiente de “Cocina central” (módulo futuro): sirve para delegar elaboración interna.',
    benefits: [
      'Delegar sin mezclar con el flujo de pedidos a proveedores.',
      'Ideal para mise en place repetitivo o bloques mañana/tarde.',
      'Historial para ver qué se cumplió y cuándo.',
    ],
    realCase: 'Viernes de elaborados: el plan de “salsas y bases” se ejecuta y queda constancia.',
    result: 'Menos conocimiento encerrado en una sola persona.',
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
    id: 'comida-personal',
    title: 'Comida de personal',
    summary: 'Registro de consumo del equipo: trabajador, servicio y coste interno.',
    Icon: UtensilsCrossed,
    detailIntro:
      'Alta de trabajadores por local, registro por fecha (desayuno, comida, cena…) con productos del catálogo o comida propia, y reportes exportables. Pensado para control interno y transparencia con el equipo.',
    benefits: [
      'Lista de personal activa sin depender de hojas sueltas.',
      'Coste acumulado visible para gestión y cierre.',
      'PDF e informes por mes cuando lo necesites.',
    ],
    realCase: 'Fin de mes: sacas el resumen de consumos sin rearmar Excel desde cero.',
    result: 'Menos fricción y números compartidos.',
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
