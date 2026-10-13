// "Que no se repitan": qué preguntas o palabras ya vio un usuario (o alguno de los jugadores de una
// sala) y cómo priorizar las que no vio. Lo que se guardó vive en la tabla contenido_visto
// (ContenidoVistoService); acá sólo están las reglas, sin base de datos.

// item (id de pregunta, palabra…) → cuándo lo vio por última vez (ms). Si no está, no lo vio.
export type Vistos = Map<string, number>;

// Ordena para elegir: primero las NO vistas (en el orden en que vienen, que ya viene mezclado) y
// después las vistas, de la que se vio hace más tiempo a la más reciente. Así no se repite nada
// hasta agotar todas, y cuando se agotan vuelve a empezar por las más viejas.
// Sin nada visto, devuelve la lista tal cual (mismo resultado que antes de esta función).
export function priorizarNoVistos<T>(lista: T[], idDe: (x: T) => string, vistos?: Vistos): T[] {
  if (!vistos || vistos.size === 0) return lista;
  const noVistas: T[] = [];
  const vistas: { x: T; cuando: number; i: number }[] = [];
  lista.forEach((x, i) => {
    const cuando = vistos.get(idDe(x));
    if (cuando === undefined) noVistas.push(x);
    else vistas.push({ x, cuando, i });
  });
  vistas.sort((a, b) => a.cuando - b.cuando || a.i - b.i);
  return [...noVistas, ...vistas.map((v) => v.x)];
}

// Una sola: al azar entre las no vistas; si ya vio todas, la que vio hace más tiempo.
// Sin nada visto, elige igual que antes: lista[⌊azar × largo⌋].
export function elegirUnaNoVista<T>(lista: T[], idDe: (x: T) => string, azar: () => number, vistos?: Vistos): T {
  const noVistas = vistos && vistos.size ? lista.filter((x) => !vistos.has(idDe(x))) : lista;
  if (noVistas.length) return noVistas[Math.floor(azar() * noVistas.length)];
  return priorizarNoVistos(lista, idDe, vistos)[0];
}
