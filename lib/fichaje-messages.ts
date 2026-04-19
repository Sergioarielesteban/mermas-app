const LS_LAST_MESSAGE_KEY = 'mermas:fichaje:last-message:';
const LS_EMOJI_ROT_KEY = 'mermas:fichaje:emoji-rot:';

export const fichajeMessages = {
  clockIn: [
    'Pilas que hoy la vaina se va a poner arrecha, de pana. 🔥',
    'Dale, mi pana, que el servicio no se saca solo.',
    'Hoy toca sudar la camiseta; vamos con todo.',
    'Prepárate, que esto huele a guerra de tickets.',
    'Manos rápidas y cabeza fría: arranca el juego.',
    'Coño, llegó la artillería pesada. Vamos pa encima.',
    'De pana: buena actitud y esa vaina sale brutal.',
    'Dale que dale, que hoy se cocina con corazón.',
    'Pilas con la mise en place, que el rush no perdona.',
    'Vamos con todo, mi gente, que hoy se rompe bonito.',
    'Hoy el ticket viene arrecho, pero nosotros más.',
    'Coño, prende motores que la sala viene fuerte.',
    'Dale, que el pase no se mueve solo.',
    'Entra fino, respira y mete ritmo: se viene candela.',
    'Pilas, mi pana: foco en el detalle y flow de equipo.',
    'De pana, hoy se viene un servicio brutal.',
    'Dale con actitud, que esa vaina sale redonda.',
    'Vamos con todo: cuchillo afilado y mente clara.',
    'Coño, hoy no hay excusas, hay servicio.',
    'Pilas con la estación, que el primer ticket ya casi cae.',
    'Dale, que cocina y sala van de la mano.',
    'Esto se va a poner arrecho, pero tú naciste pa esto.',
    'De pana, que hoy se factura con clase.',
    'Vamos con todo y sin miedo, mi gente.',
    'Pilas, que el turno arranca y nadie frena.',
    'Dale duro, que esa vaina no se levanta sola.',
    'Coño, qué rico cuando el equipo entra enchufado.',
    'Hoy toca disciplina, ritmo y buena vibra.',
    'De pana, vamos a sacar un servicio de campeonato.',
    'Pilas con tiempos, que la cocina habla con reloj.',
    'Dale que hoy el comensal sale diciendo brutal.',
    'Vamos con todo, que el ticket canta y nosotros bailamos.',
    'Coño, hoy se trabaja fino, limpio y rápido.',
    'Pilas, mi pana, que esta vaina viene picante.',
    'Dale con garra: arranque firme y sonrisa en la cara.',
    'Hoy no se improvisa: se ejecuta, de pana.',
    'Vamos con todo, que el pase pide precisión.',
    'Pilas con la comanda: una mirada y ya entendiste.',
    'Dale, que sala confía en cocina y cocina responde.',
    'Coño, qué arrecho cuando todo sale sincronizado.',
    'De pana: orden primero, velocidad después.',
    'Vamos con todo, que hoy toca dejar huella.',
    'Pilas, que el encargado viene con ojo de halcón.',
    'Dale, que esa vaina se controla con oficio.',
    'Coño, arranca el turno: menos cuento, más fuego.',
    'De pana, manos activas y cero drama.',
    'Vamos con todo, mi pana, que el local está full.',
    'Pilas con el emplatado: simple, limpio, brutal.',
    'Dale sin miedo, que hoy se cocina con orgullo.',
    'Esto se pone arrecho, sí; y nosotros también. 🔥',
  ],
  clockOut: [
    'Coño, hoy sí estuvo arrecho. Buen trabajo, de pana.',
    'Servicio sacado, misión cumplida. Respira, mi pana.',
    'Hoy no fue fácil, pero saliste de pie. Brutal.',
    'Cierra, limpia y vete con la cabeza alta.',
    'Otro día en la jungla... y sobreviviste de pana.',
    'Dale suave pa casa, que te lo ganaste.',
    'Coño, qué jornada. Ahora toca bajar revoluciones.',
    'De pana, hoy dejaste el nombre del equipo arriba.',
    'Se cerró esa vaina. Descansa, que mañana hay más.',
    'Brutal lo de hoy: orden, ritmo y corazón.',
    'Pilas con el descanso; el cuerpo también factura.',
    'Dale, apaga cocina mental y prende modo paz.',
    'Coño, saliste fino del rush. Respeto total.',
    'De pana, servicio duro pero bien resuelto.',
    'Vamos con todo mañana; hoy toca soltar.',
    'Esa vaina quedó cerrada como se debe.',
    'Dale pa casa, mi pana, con orgullo en el pecho.',
    'Coño, jornada intensa, cierre elegante.',
    'De pana: sudaste, resolviste y cumpliste.',
    'Brutal el cierre. Ahora sí, desconecta.',
    'Pilas con hidratarte; hoy se dejó el alma.',
    'Dale, que mañana el pase vuelve a pedir guerra.',
    'Coño, qué arrecho cuando el equipo responde así.',
    'De pana, hoy se ganó con carácter.',
    'Cierre completo: estación limpia y mente en paz.',
    'Dale suave: misión cocina terminada.',
    'Coño, hoy fue candela, pero saliste crack.',
    'De pana, otro turno bien peleado.',
    'Brutal: no sobró energía, pero sobró oficio.',
    'Pilas, descansa bien que mañana hay revancha.',
    'Dale, suelta esa tensión y celebra en pequeño.',
    'Coño, qué servicio tan bravo... y lo sacaste.',
    'De pana: cerraste fino, sin inventos.',
    'Esa vaina terminó y terminó bien.',
    'Dale pa fuera con tranquilidad, mi pana.',
    'Coño, hoy tocó guerra y ganamos.',
    'De pana, impecable la actitud hasta el final.',
    'Brutal cierre: limpio, ordenado y sin ruido.',
    'Pilas con el descanso, que te lo mereces.',
    'Dale, mañana volvemos con todo.',
    'Coño, qué gusto cuando el equipo cierra unido.',
    'De pana, hoy no se regaló nada y se logró todo.',
    'Esa vaina quedó lista. A descansar.',
    'Dale, quítate el turno de la cabeza por hoy.',
    'Coño, digno de aplauso silencioso ese cierre.',
    'De pana, te fajaste y se notó.',
    'Brutal lo tuyo, mi pana. Descanso merecido.',
    'Pilas: cena, ducha y cama, en ese orden.',
    'Dale tranquilo, que hoy cumpliste con creces.',
    'Coño, otro servicio arrecho superado. Vamos pa casa.',
  ],
} as const;

const FICHAJE_EMOJIS = {
  clockIn: ['🔥', '💪', '🍳', '⚡', '🚀', '👨‍🍳', '👩‍🍳', '🧨', '🎯', '🤝'],
  clockOut: ['🫡', '🏁', '😮‍💨', '🍻', '👏', '🛋️', '🌙', '✨', '💤', '🤟'],
} as const;

function getRandomIndexWithoutLast(length: number, lastIndex: number | null): number {
  if (length <= 1) return 0;
  const first = Math.floor(Math.random() * length);
  if (lastIndex == null || first !== lastIndex) return first;
  let next = Math.floor(Math.random() * (length - 1));
  if (next >= first) next += 1;
  return next;
}

export function pickFichajeMessage(kind: 'clock_in' | 'clock_out'): string {
  const list = kind === 'clock_in' ? fichajeMessages.clockIn : fichajeMessages.clockOut;
  const key = `${LS_LAST_MESSAGE_KEY}${kind}`;
  if (typeof window === 'undefined') return list[0] ?? '';
  try {
    const raw = window.localStorage.getItem(key);
    const lastIndex = raw == null ? null : parseInt(raw, 10);
    const idx = getRandomIndexWithoutLast(list.length, Number.isNaN(lastIndex ?? NaN) ? null : lastIndex);
    window.localStorage.setItem(key, String(idx));
    return list[idx] ?? list[0] ?? '';
  } catch {
    return list[Math.floor(Math.random() * list.length)] ?? '';
  }
}

export function pickFichajeEmoji(kind: 'clock_in' | 'clock_out'): string {
  const pool = kind === 'clock_in' ? FICHAJE_EMOJIS.clockIn : FICHAJE_EMOJIS.clockOut;
  const key = `${LS_EMOJI_ROT_KEY}${kind}`;
  if (typeof window === 'undefined') return pool[0] ?? '✨';
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw != null ? parseInt(raw, 10) || 0 : 0;
    const idx = ((n % pool.length) + pool.length) % pool.length;
    window.localStorage.setItem(key, String(n + 1));
    return pool[idx] ?? pool[0] ?? '✨';
  } catch {
    return pool[Math.floor(Math.random() * pool.length)] ?? '✨';
  }
}

