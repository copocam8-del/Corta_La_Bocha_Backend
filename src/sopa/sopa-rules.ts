import { mezclar } from '../trivia/trivia-rules';
import { priorizarNoVistos, type Vistos } from '../games/vistos';

// Sopa de letras futbolera. El servidor arma la grilla y guarda dónde está cada palabra; el jugador
// marca inicio y fin y el servidor verifica. Palabras sin espacios ni Ñ (la grilla usa A-Z).

export type TematicaSopa =
  | 'clubes_argentinos' | 'clubes_del_mundo' | 'selecciones' | 'jugadores' | 'estadios' | 'tecnicos' | 'palabras_futboleras';
export type DificultadSopa = 'facil' | 'medio' | 'dificil';

export const TEMATICAS_SOPA: Record<TematicaSopa, { nombre: string; palabras: string[] }> = {
  clubes_argentinos: {
    nombre: 'Clubes argentinos',
    palabras: ['BOCA', 'RIVER', 'RACING', 'INDEPENDIENTE', 'HURACAN', 'LANUS', 'BANFIELD', 'TALLERES', 'BELGRANO',
      'COLON', 'UNION', 'ESTUDIANTES', 'GIMNASIA', 'VELEZ', 'TIGRE', 'PLATENSE', 'CENTRAL', 'NEWELLS', 'ARGENTINOS',
      'SARMIENTO', 'INSTITUTO', 'ATLANTA', 'CHACARITA', 'QUILMES', 'OLIMPO',
      // Agregadas por Camila (octubre 2026)
      'SANLORENZO'],
  },
  clubes_del_mundo: {
    nombre: 'Clubes del mundo',
    palabras: ['BARCELONA', 'REALMADRID', 'BAYERN', 'DORTMUND', 'BENFICA', 'JUVENTUS', 'LIVERPOOL', 'MANCHESTER',
      'PARIS', 'FLAMENGO', 'PALMEIRAS', 'PENAROL', 'NACIONAL'],
  },
  selecciones: {
    nombre: 'Selecciones',
    palabras: ['ARGENTINA', 'BRASIL', 'URUGUAY', 'ALEMANIA', 'FRANCIA', 'ITALIA', 'INGLATERRA', 'PORTUGAL', 'CROACIA',
      'MARRUECOS', 'COLOMBIA', 'CHILE', 'PERU', 'MEXICO', 'JAPON', 'SENEGAL', 'BELGICA', 'SUIZA', 'SUECIA', 'POLONIA',
      'GHANA', 'NIGERIA', 'CAMERUN', 'ECUADOR', 'PARAGUAY', 'CANADA'],
  },
  jugadores: {
    nombre: 'Jugadores',
    palabras: ['MESSI', 'MARADONA', 'PELE', 'RIQUELME', 'TEVEZ', 'KEMPES', 'BATISTUTA', 'NEYMAR', 'ZIDANE', 'MBAPPE',
      'AGUERO', 'PALERMO', 'CRUYFF', 'RONALDO', 'ROMARIO', 'MODRIC', 'HAALAND', 'SALAH', 'PIRLO', 'TOTTI', 'MALDINI',
      'HENRY', 'DROGBA', 'FORLAN', 'SUAREZ', 'CAVANI', 'MASCHERANO',
      // Agregadas por Camila (octubre 2026)
      'BECKENBAUER', 'BOCHINI', 'DESTEFANO', 'FRANCESCOLI', 'MATTHAUS', 'PLATINI', 'RONALDINHO', 'VALDERRAMA', 'ZAMORANO'],
  },
  estadios: {
    nombre: 'Estadios',
    palabras: ['BOMBONERA', 'MONUMENTAL', 'MARACANA', 'WEMBLEY', 'ANFIELD', 'CENTENARIO', 'AZTECA', 'BERNABEU',
      'MESTALLA', 'CILINDRO', 'GASOMETRO', 'LUZHNIKI', 'MINEIRAO', 'MORUMBI',
      // Agregadas por Camila (octubre 2026)
      'ATANASIO', 'CAMPNOU', 'SANSIRO'],
  },
  tecnicos: {
    nombre: 'Directores técnicos',
    palabras: ['BIELSA', 'BILARDO', 'MENOTTI', 'SCALONI', 'GALLARDO', 'SIMEONE', 'BIANCHI', 'PEKERMAN', 'SABELLA',
      'GUARDIOLA', 'MOURINHO', 'ANCELOTTI', 'KLOPP', 'FERGUSON', 'BASILE', 'POCHETTINO'],
  },
  palabras_futboleras: {
    nombre: 'Palabras futboleras',
    palabras: ['ARBITRO', 'ARQUERO', 'AMONESTACION', 'BALON', 'BANQUILLO', 'BOTINES', 'CABEZAZO', 'CAMISETA', 'CANCHA',
      'CAPITAN', 'CHILENA', 'CLASICO', 'CORNER', 'DEFENSA', 'DELANTERO', 'EMPATE', 'ENGANCHE', 'ESPINILLERAS', 'EXTREMO',
      'FALTA', 'GAMBETA', 'GOLEADA', 'GOLEADOR', 'GUARDAMETA', 'GUANTES', 'HINCHA', 'LATERAL', 'LIBERO', 'LIBERTADORES',
      'MEDIOCAMPISTA', 'OFFSIDE', 'PARED', 'PENAL', 'PENALES', 'PELOTA', 'PIVOTE', 'PORTERO', 'POSTE', 'RABONA',
      'SILBATO', 'SOMBRERITO', 'STOPPER', 'SUPLENTE', 'TACOS', 'TARJETA', 'TITULAR', 'TRAVESANO', 'TRIBUNA', 'TROFEO',
      'VOLEA'],
  },
};

// Tamaño, cantidad de palabras, tiempo, direcciones y multiplicador de puntos por dificultad
export const CONFIG_SOPA: Record<DificultadSopa, { tamano: number; palabras: number; segundos: number; dirs: [number, number][]; multiplicador: number }> = {
  facil: { tamano: 10, palabras: 6, segundos: 180, dirs: [[0, 1], [1, 0]], multiplicador: 1 },
  medio: { tamano: 12, palabras: 8, segundos: 240, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]], multiplicador: 1.3 },
  dificil: {
    tamano: 14, palabras: 10, segundos: 300,
    dirs: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]], // también al revés
    multiplicador: 1.6,
  },
};

export const GRACIA_MS = 3000;
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface Ubicacion {
  palabra: string;
  f: number; // fila de inicio
  c: number; // columna de inicio
  df: number;
  dc: number;
}

export interface Sopa {
  grilla: string[]; // una fila por string
  ubicaciones: Ubicacion[];
}

// Con "vistos", primero intenta ubicar las palabras que no se vieron (después las vistas hace más tiempo)
export function generarSopa(tematica: TematicaSopa, dificultad: DificultadSopa, azar: () => number, vistos?: Vistos): Sopa {
  const { tamano, palabras: cantidad, dirs } = CONFIG_SOPA[dificultad];
  const celdas: (string | null)[][] = Array.from({ length: tamano }, () => Array<string | null>(tamano).fill(null));
  const candidatas = priorizarNoVistos(mezclar(TEMATICAS_SOPA[tematica].palabras.filter((p) => p.length <= tamano), azar), (p) => p, vistos);
  const ubicaciones: Ubicacion[] = [];

  for (const palabra of candidatas) {
    if (ubicaciones.length >= cantidad) break;
    // Evita palabras que estén contenidas en otra elegida (se confundirían)
    if (ubicaciones.some((u) => u.palabra.includes(palabra) || palabra.includes(u.palabra))) continue;
    for (let intento = 0; intento < 200; intento++) {
      const [df, dc] = dirs[Math.floor(azar() * dirs.length)];
      const f = Math.floor(azar() * tamano);
      const c = Math.floor(azar() * tamano);
      const fFin = f + df * (palabra.length - 1);
      const cFin = c + dc * (palabra.length - 1);
      if (fFin < 0 || fFin >= tamano || cFin < 0 || cFin >= tamano) continue;
      let entra = true;
      for (let i = 0; i < palabra.length && entra; i++) {
        const actual = celdas[f + df * i][c + dc * i];
        if (actual !== null && actual !== palabra[i]) entra = false;
      }
      if (!entra) continue;
      for (let i = 0; i < palabra.length; i++) celdas[f + df * i][c + dc * i] = palabra[i];
      ubicaciones.push({ palabra, f, c, df, dc });
      break;
    }
  }
  const grilla = celdas.map((fila) => fila.map((l) => l ?? ABC[Math.floor(azar() * ABC.length)]).join(''));
  return { grilla, ubicaciones };
}

// Celdas de una línea recta (horizontal, vertical o diagonal). null si no es una línea válida.
export function celdasDeLinea(desde: { f: number; c: number }, hasta: { f: number; c: number }): { f: number; c: number }[] | null {
  const df = Math.sign(hasta.f - desde.f);
  const dc = Math.sign(hasta.c - desde.c);
  const largoF = Math.abs(hasta.f - desde.f);
  const largoC = Math.abs(hasta.c - desde.c);
  if (largoF !== 0 && largoC !== 0 && largoF !== largoC) return null; // no es recta
  const n = Math.max(largoF, largoC) + 1;
  return Array.from({ length: n }, (_, i) => ({ f: desde.f + df * i, c: desde.c + dc * i }));
}

// ¿La selección coincide exactamente con una palabra escondida (en cualquiera de los dos sentidos)?
export function buscarPalabra(sopa: Sopa, desde: { f: number; c: number }, hasta: { f: number; c: number }): Ubicacion | null {
  for (const u of sopa.ubicaciones) {
    const fin = { f: u.f + u.df * (u.palabra.length - 1), c: u.c + u.dc * (u.palabra.length - 1) };
    const igual = (a: { f: number; c: number }, b: { f: number; c: number }) => a.f === b.f && a.c === b.c;
    if ((igual(desde, { f: u.f, c: u.c }) && igual(hasta, fin)) || (igual(desde, fin) && igual(hasta, { f: u.f, c: u.c }))) return u;
  }
  return null;
}

export function celdasDe(u: Ubicacion) {
  return Array.from({ length: u.palabra.length }, (_, i) => ({ f: u.f + u.df * i, c: u.c + u.dc * i }));
}

// Puntos: cada palabra (5 + largo), más un bonus si encontraste todas (30 + 1 por cada 3 s que sobraron),
// todo por el multiplicador de la dificultad
export function puntosSopa(dificultad: DificultadSopa, encontradas: string[], total: number, segundosSobrantes: number): number {
  const base = encontradas.reduce((s, p) => s + 5 + p.length, 0);
  const bonus = encontradas.length === total ? 30 + Math.floor(Math.max(0, segundosSobrantes) / 3) : 0;
  return Math.round((base + bonus) * CONFIG_SOPA[dificultad].multiplicador);
}
