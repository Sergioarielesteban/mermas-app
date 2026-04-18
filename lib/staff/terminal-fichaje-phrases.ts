/** Frases para pantalla de éxito del terminal de fichaje (hostelería). */

const ENTRADA: string[] = [
  'Hoy el servicio va a salir redondo. ¡Confianza y equipo!',
  'A por un día fuerte: cocina con mimo, sala con salero.',
  'Cada servicio es un partido: tú ya estás en el once inicial.',
  'Fuerza y buen humor: eso es lo que marca la diferencia.',
  'Que la jornada te deje buen sabor de boca (y buena propina).',
  'Manos a la obra: el local te necesita a tope.',
  'Respira, sonríe y a darlo todo. ¡Tú puedes!',
  'Hoy también vamos a petarlo. ¡Vamos!',
  'Turno ON: cabeza fría, ritmo arriba.',
  'El cliente nota cuando el equipo va fino. ¡Eso eres tú!',
];

const SALIDA: string[] = [
  '¡Cortado el cable! El curro ha muerto por hoy. Descansa como un jefe.',
  'Fuera de cocina, fuera de drama. Ahora toca modo sofá.',
  'Gracias por el currazo. Eres un crack y el local lo sabe.',
  'Ya está el tinglao cerrado. A disfrutar lo que queda de día.',
  'Fichaje finiquitado. Nos vemos en la próxima batalla.',
  'Hoy has sudado la camiseta: mérito y cerveza (o lo que toque).',
  'A tomar por saco el delantal mental. ¡Descanso merecido!',
  'Has dejado el puesto más bonito que lo encontraste. Eso cuenta.',
  'Servicio liquidado. Ahora sí: pies arriba y cero incidencias en casa.',
  'Gracias, fiera. Mañana más y peor… o mejor, que también toca.',
  'Turno aparcado. Que la cama te reciba con honors.',
  'Has ganado el derecho a no pensar en tickets hasta mañana.',
];

export function pickTerminalPhrase(kind: 'clock_in' | 'clock_out'): string {
  const list = kind === 'clock_in' ? ENTRADA : SALIDA;
  const i = Math.floor(Math.random() * list.length);
  return list[i] ?? list[0];
}

export function terminalSuccessEmoji(kind: 'clock_in' | 'clock_out'): string {
  const inEm = ['💪', '🔥', '⭐', '👨‍🍳', '👩‍🍳', '🚀'];
  const outEm = ['🍻', '😎', '🫡', '🛋️', '✌️', '🎉'];
  const pool = kind === 'clock_in' ? inEm : outEm;
  return pool[Math.floor(Math.random() * pool.length)] ?? '✨';
}
