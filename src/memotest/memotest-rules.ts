import { mezclar } from '../trivia/trivia-rules';

// Memotest futbolero: pares de cartas de TEXTO con íconos propios (nada de escudos ni logos reales).
// El servidor guarda el mazo boca abajo y revela cada carta cuando el jugador la da vuelta.

export type TemaMemotest =
  | 'clubes_apodos' | 'jugadores_selecciones' | 'estadios_clubes' | 'jugadores_apodos' | 'selecciones_apodos';
export type NivelMemotest = 'facil' | 'medio' | 'dificil';
// Ícono que dibuja el frontend para cada lado del par
export type IconoCarta = 'escudo' | 'apodo' | 'jugador' | 'bandera' | 'estadio';

export const TEMAS_MEMOTEST: Record<TemaMemotest, { nombre: string; iconos: [IconoCarta, IconoCarta]; pares: [string, string][] }> = {
  clubes_apodos: {
    nombre: 'Clubes y apodos',
    iconos: ['escudo', 'apodo'],
    pares: [
      ['Boca Juniors', 'Xeneize'], ['River Plate', 'Millonario'], ['Racing Club', 'La Academia'], ['Independiente', 'El Rojo'],
      ['San Lorenzo', 'El Ciclón'], ['Huracán', 'El Globo'], ['Estudiantes', 'El Pincha'], ['Gimnasia La Plata', 'El Lobo'],
      ["Newell's Old Boys", 'La Lepra'], ['Rosario Central', 'El Canalla'], ['Vélez Sarsfield', 'El Fortín'], ['Lanús', 'El Granate'],
      ['Banfield', 'El Taladro'], ['Argentinos Juniors', 'El Bicho'], ['Belgrano', 'El Pirata'], ['Colón', 'El Sabalero'],
      ['Tigre', 'El Matador'], ['Unión', 'El Tatengue'],
      // Agregadas por Camila (octubre 2026)
      ['Juventus', 'Vecchia Signora'], ['Inter', 'Nerazzurri'], ['Manchester City', 'Citizens'], ['Arsenal', 'Gunners'],
      ['Chelsea', 'Blues'],
    ],
  },
  jugadores_selecciones: {
    nombre: 'Jugadores y selecciones',
    iconos: ['jugador', 'bandera'],
    pares: [
      ['Lionel Messi', 'Argentina'], ['Neymar', 'Brasil'], ['Kylian Mbappé', 'Francia'], ['Luka Modrić', 'Croacia'],
      ['Mohamed Salah', 'Egipto'], ['Erling Haaland', 'Noruega'], ['Robert Lewandowski', 'Polonia'], ['Kevin De Bruyne', 'Bélgica'],
      ['Cristiano Ronaldo', 'Portugal'], ['Luis Suárez', 'Uruguay'], ['Harry Kane', 'Inglaterra'], ['Son Heung-min', 'Corea del Sur'],
      ['Pedri', 'España'], ['James Rodríguez', 'Colombia'], ['Alexis Sánchez', 'Chile'], ['Achraf Hakimi', 'Marruecos'],
      ['Sadio Mané', 'Senegal'],
    ],
  },
  estadios_clubes: {
    nombre: 'Estadios y clubes',
    iconos: ['estadio', 'escudo'],
    pares: [
      ['La Bombonera', 'Boca Juniors'], ['El Monumental', 'River Plate'], ['El Cilindro', 'Racing Club'],
      ['Libertadores de América', 'Independiente'], ['Nuevo Gasómetro', 'San Lorenzo'], ['Tomás Adolfo Ducó', 'Huracán'],
      ['José Amalfitani', 'Vélez Sarsfield'], ['Camp Nou', 'Barcelona'], ['Santiago Bernabéu', 'Real Madrid'],
      ['Old Trafford', 'Manchester United'], ['Anfield', 'Liverpool'], ['Allianz Arena', 'Bayern Múnich'],
      ['Signal Iduna Park', 'Borussia Dortmund'], ['Metropolitano', 'Atlético de Madrid'],
      // Agregadas por Camila (octubre 2026)
      ['San Siro', 'Milan'], ['Maracaná', 'Flamengo'], ['Campeón del Siglo', 'Peñarol'],
    ],
  },
  // Temas nuevos (octubre 2026, de Camila)
  jugadores_apodos: {
    nombre: 'Jugadores y apodos',
    iconos: ['jugador', 'apodo'],
    pares: [
      ['Lionel Messi', 'La Pulga'], ['Diego Maradona', 'El Pelusa'], ['Ronaldo Nazário', 'El Fenómeno'],
      ['Johan Cruyff', 'El Holandés Volador'], ['Franz Beckenbauer', 'El Káiser'], ['Gabriel Batistuta', 'Batigol'],
      ['Carlos Valderrama', 'El Pibe'], ['Enzo Francescoli', 'El Príncipe'], ['Javier Zanetti', 'El Tractor'],
      ['Ángel Di María', 'Fideo'], ['Sergio Agüero', 'Kun'],
    ],
  },
  selecciones_apodos: {
    nombre: 'Selecciones y apodos',
    iconos: ['bandera', 'apodo'],
    pares: [
      ['Argentina', 'La Albiceleste'], ['Brasil', 'La Canarinha'], ['Uruguay', 'La Celeste'], ['España', 'La Roja'],
      ['Francia', 'Les Bleus'], ['Italia', 'La Azzurra'], ['Alemania', 'Die Mannschaft'],
      ['Países Bajos', 'La Naranja Mecánica'], ['Colombia', 'La Tricolor'], ['México', 'El Tri'],
    ],
  },
};

export const NIVELES_MEMOTEST: Record<NivelMemotest, { pares: number; segundos: number; base: number }> = {
  facil: { pares: 6, segundos: 120, base: 60 },
  medio: { pares: 8, segundos: 180, base: 90 },
  dificil: { pares: 10, segundos: 240, base: 120 },
};

export const GRACIA_MS = 3000;

export interface Carta {
  par: number; // índice del par
  texto: string;
  icono: IconoCarta;
}

export function armarMazo(tema: TemaMemotest, nivel: NivelMemotest, azar: () => number): Carta[] {
  const t = TEMAS_MEMOTEST[tema];
  const elegidos = mezclar(t.pares, azar).slice(0, NIVELES_MEMOTEST[nivel].pares);
  const cartas = elegidos.flatMap(([a, b], par) => [
    { par, texto: a, icono: t.iconos[0] },
    { par, texto: b, icono: t.iconos[1] },
  ]);
  return mezclar(cartas, azar);
}

// Puntos al completar: base del nivel + eficiencia (menos intentos fallidos) + rapidez.
// Si se acaba el tiempo o se rinde: 5 por cada par encontrado.
export function puntosMemotest(nivel: NivelMemotest, completo: boolean, paresEncontrados: number, movimientos: number, segundos: number): number {
  if (!completo) return paresEncontrados * 5;
  const { pares, base } = NIVELES_MEMOTEST[nivel];
  const eficiencia = Math.max(0, (2 * pares - movimientos) * 5);
  const rapidez = Math.max(0, 40 - Math.floor(segundos / 5));
  return base + eficiencia + rapidez;
}
