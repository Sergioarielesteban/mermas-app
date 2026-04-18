/** Frases para pantalla de éxito del terminal de fichaje (hostelería). Rotación secuencial en el dispositivo (localStorage). */

const LS_PHRASE = 'mermas:terminal-fichaje:rot:phrase:';
const LS_EMOJI = 'mermas:terminal-fichaje:rot:emoji:';

function nextRotIndex(storageKey: string, modulo: number): number {
  if (modulo <= 0) return 0;
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const n = raw != null ? parseInt(raw, 10) || 0 : 0;
    const idx = ((n % modulo) + modulo) % modulo;
    window.localStorage.setItem(storageKey, String(n + 1));
    return idx;
  } catch {
    return Math.floor(Math.random() * modulo);
  }
}

const ENTRADA: string[] = [
  'Menuda jornada te espera: ponte el mono como un jefe y a darle caña.',
  'Ya estás dentro del tinglao. Que no te pillen el culo fuera del fuego.',
  'Entró el artista. Ahora que el show sea de categoría.',
  'Ponte las botas que hoy hay que reventar el servicio.',
  'Modo matón de cocina activado (el bueno, el del equipo).',
  'A trabajar como si el jefe te estuviera mirando… porque igual lo está.',
  'Hoy el servicio se come o nos comemos nosotros: tú ya estás en el banquillo.',
  'Cabeza fría, manos rápidas y cero drama antes del primer ticket.',
  'Que no te la cuelen: tú mandas en tu parroquia. ¡A darle!',
  'El cliente flipa cuando el equipo va fino. Hoy tú eres ese ingrediente.',
  'Turno ON: menos postureo y más meterle mano al asunto.',
  'Si el día se pone chungo, tú más chulo: eso es hostelería.',
  'A por el curro con salero: que la sala y la cocina te oigan venir.',
  'Nadie te ha dicho que sería fácil; te han dicho que serías crack.',
  'Aquí entra quien la liara y la desliara. Adelante.',
  'El servicio no espera: tú tampoco. ¡Dentro!',
  'Cero pánico, cien por cien actitud. Esa es la tónica.',
  'Que reparta suerte quien toque… y tú reparte platos como un campeón.',
  'Hoy toca hacer magia con lo que haya en cámara y en barra.',
  'Bienvenido al circo. El espectáculo empieza en cuanto suene el primer ticket.',
  'Nada de hacerse el sueco: el equipo cuenta contigo a muerte.',
  'Prepárate: la hora punta no perdona ni al más listo del mundo.',
  'Tú no vienes a pasar el rato; vienes a dejar el listón bien alto.',
  'Suelta el móvil en el bolsillo y suelta manos en el carro. Vamos.',
  'El día es largo; el café cuenta. ¡Ánimo y sin pereza!',
  'Si alguien alza la voz, tú alza el ritmo: así se gana el servicio.',
  'Aquí mandamos nosotros… y el cliente se entera al final, feliz.',
  'Hoy no hay excusas, hay servicio. Pa lante y con garra.',
  'Tic tac… el reloj no negocia. Tú tampoco con la flojera.',
  'Enchufa el buen rollo que el enchufe eléctrico del local ya está.',
  'Vístete de valiente que el turno a veces es maratoniano.',
  'Que la fuerza del equipo te acompañe (y el café de la máquina también).',
  'El local despierta cuando tú entras. Hágale que hay que facturar.',
  'Llegaste en el momento justo: ni tarde ni temprano. A currar.',
  'Nada de cara de lunes: hoy es el día de brillar en sala o en cocina.',
  'Si la cosa se pone fea, tú te pones más guapo aún trabajando.',
  'Eres el refuerzo que el equipo pedía. No decepciones al banquillo.',
  'Menos charla de pasillo y más manos al fuego. Eso es.',
  'Hoy el cliente se va a ir hablando bien o hablando muy bien. Tú eliges el nivel.',
  'Entras con actitud de final de Champions: concentración y un poco de locura sana.',
  'El tinglao ya huele a curro… y tú acabas de subir el nivel.',
  'Nadie te quita lo bailao… pero lo de hoy aún no está bailado. ¡A por ello!',
];

const SALIDA: string[] = [
  '¡Cortado el cable! El curro ha muerto por hoy. Pal sofá como un rey.',
  'Fuera cocina, fuera drama. Ahora toca modo sofá y cero culpa.',
  'Gracias por el currazo. Eres un crack y el local lo sabe (aunque no lo diga).',
  'Ya está el tinglao cerrado en tu cabeza. A disfrutar lo que queda.',
  'Fichaje finiquitado. Nos vemos en la próxima batalla (o en el after).',
  'Hoy has sudado la camiseta: mérito, cerveza o lo que te dé la gana.',
  'A tomar viento el delantal mental. ¡Descanso merecido, fiera!',
  'Has dejado el puesto más bonito que lo pillaste. Eso no lo hace cualquiera.',
  'Servicio liquidado. Pies arriba y cero tickets hasta que salga el sol.',
  'Gracias, máquina. Mañana más y peor… o mejor, que también toca.',
  'Turno aparcado. Que la cama te reciba con honores de estado.',
  'Has ganado el derecho a no pensar en comandas hasta mañana.',
  'Pal mercadillo con el delantal en el bolsillo. Descansa que te lo has ganado.',
  'Cierra el tinglao en la cabeza: tú ya has cumplido, lo demás es paja.',
  'Fuera ostias de incidencias, dentro pipas y tele. Así sí.',
  'Modo zombie laboral desactivado. Activa modo humano en casa.',
  'El teléfono del curro puede llamar mañana. Hoy que no suene ni en pintura.',
  'Has cerrado caja en el alma también. Descansa sin remordimientos.',
  'Ni una incidencia más hoy… salvo la de no currar más. Disfrútala.',
  'Fuera uniforme, dentro pijama mental. Ese es el plan.',
  'El mundo sigue girando; tú ya no das vueltas al sartén. Bien hecho.',
  'Hasta la vista, baby… la cocina te echa de menos en cinco minutos.',
  'Suelta el estrés en la puerta como quien cuelga el abrigo mojado.',
  'Misión cumplida sin fanfarria. Eso es clase y media.',
  'A mimir con honor. Mañana otro round y otro café.',
  'Que nadie te robe el descanso: es tuyo, lo has pagado a base de bien.',
  'Cierras sesión como quien apaga la última luz del local. Paz.',
  'El ratón del TPV también descansa. Tú ya más que él.',
  'Has apagado el fuego de la jornada. Que solo quede el del sofá.',
  'Hoy has sido un animal de carga con estilo. A pastar en paz.',
  'Ni un ticket más en la cabeza hasta que el despertador vuelva a ser el enemigo.',
  'El cliente ya no es tu problema hasta el próximo turno. Celebra.',
  'Largas el pie del acelerador del servicio. Ahora solo acelera el Netflix.',
  'Te has ganado el silencio bonito de casa. Disfrútalo.',
  'Fuera el delantal, dentro la vida. Bien jugado.',
  'Has dejado el local en pie; ahora tú también en horizontal.',
  'Servicio fino, cierre fino. Así se hace, campeón.',
  'Que la nevera de casa no te juzgue si cenás lo que sea. Te lo has ganado.',
  'Hoy el tinglao ha ganado por goleada… y tú has sido del equipo. Descansa.',
  'A desconectar el cerebro de comandas. Modo avión en el sofá.',
  'Has fichado salida; la vida te fichó entrada al descanso. Bienvenido.',
];

const EMOJI_IN = ['💪', '🔥', '⭐', '👨‍🍳', '👩‍🍳', '🚀', '😈', '🤙', '⚡', '🎯', '🥊', '🧨'];
const EMOJI_OUT = ['🍻', '😎', '🫡', '🛋️', '✌️', '🎉', '😴', '💨', '🏁', '🧘', '🛀', '🥱'];

export function pickTerminalPhrase(kind: 'clock_in' | 'clock_out'): string {
  const list = kind === 'clock_in' ? ENTRADA : SALIDA;
  const idx = nextRotIndex(`${LS_PHRASE}${kind}`, list.length);
  return list[idx] ?? list[0];
}

export function terminalSuccessEmoji(kind: 'clock_in' | 'clock_out'): string {
  const pool = kind === 'clock_in' ? EMOJI_IN : EMOJI_OUT;
  const idx = nextRotIndex(`${LS_EMOJI}${kind}`, pool.length);
  return pool[idx] ?? '✨';
}
