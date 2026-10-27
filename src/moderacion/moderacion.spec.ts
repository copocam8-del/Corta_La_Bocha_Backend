import * as fs from 'fs';
import * as path from 'path';
import { contieneOfensivo, esNombreReservado, usuarioPermitido } from './filtro';
import { FRASES_PROHIBIDAS, PALABRAS_PROHIBIDAS, RAICES_PROHIBIDAS, RESERVADOS, RESERVADOS_ADENTRO, RESERVADOS_AL_BORDE } from './palabras';
import { AI_ANSWER_BANK } from '../solo-matches/ai-answer-bank';
import { FAKE_EXTRA_ANSWERS } from '../tutti-frutti/fake-ai-provider';
import { BANCO_IMPOSTOR, NOMBRES_CATEGORIA } from '../impostor/impostor-bank';
import { BANCO } from '../ahorcado/ahorcado-bank';
import { PREGUNTAS } from '../trivia/trivia-bank';
import { TEMATICAS_SOPA } from '../sopa/sopa-rules';
import { TEMAS_MEMOTEST } from '../memotest/memotest-rules';
import { TEMATICAS } from '../solo-matches/solo-quick';

describe('contieneOfensivo', () => {
  it.each([
    'puto',
    'Puta',
    'hijo de puta',
    'sos un pelotudo',
    'BOLUDO',
    'la concha de tu madre',
    'conchetumadre',
    'andate a la mierda',
    'forro',
    'trolo',
    'maricón',
    'sudaca',
    'negro villero',
    'mogólico',
    'retrasado mental',
    'pija',
    'poronga',
    'culo',
    'fuck you',
    'motherfucker',
    'bitch',
    'nigger',
    'faggot',
    'retard',
    'porno',
    'putos',
    'reputa',
    'lapija',
    'hdp',
  ])('"%s" es ofensivo', (t) => {
    expect(contieneOfensivo(t)).toBe(true);
  });

  it.each([
    // leetspeak
    'put0',
    'p0rn0',
    'cu1o',
    'b0lud0',
    'p3l0tud0',
    'pu7a',
    'm13rd4',
    '@sshole',
    '$hit',
    '$exo',
    'h1j0 d3 put4 y m13rd4',
    // letras repetidas
    'puuuto',
    'putoooo',
    'PUUUUTAAAA',
    'boluuuudo',
    'fuuuuck',
    'puuto',
    // separadores
    'p.u.t.o',
    'p u t o',
    'p_u_t_o',
    'p-u-t-a',
    'sos un p.u.t.o',
    'pu.to',
    'p.uuu.t.0',
    // con números pegados (nombres de usuario)
    'puto123',
    'pelotudo_99',
    'MIERDA10',
  ])('evasión "%s" se detecta', (t) => {
    expect(contieneOfensivo(t)).toBe(true);
  });

  // Nunca se pueden bloquear
  it.each([
    'Computadora',
    'Disputa',
    'Disputado',
    'Diputado',
    'Imputado',
    'Reputación',
    'Pollo',
    'Cuchillo',
    'Concha Acayaguá',
    'Concha',
    'Cálculo',
    'Película',
    'Penne',
    'Pijama',
    'Año',
    'Foro',
    'Zorro',
    'Perro',
    'Vergara',
    'Scunthorpe United',
    'Dick Advocaat',
    'Badminton',
    'Mari Contreras',
    'Pasarella',
    'Assist',
    'Culé',
    'Negro Enrique',
    'Bolita',
    'Gil Dias',
    'kkkkkk',
    'xxxxxx',
    'Nigeria',
    'Deportivo Morón',
    'retraso',
    'Hoy jugamos un partido de fútbol con amigos',
    'Me gusta el asado',
    '',
  ])('"%s" NO es ofensivo', (t) => {
    expect(contieneOfensivo(t)).toBe(false);
  });

  it('acepta null, undefined y cosas que no son texto', () => {
    expect(contieneOfensivo(null)).toBe(false);
    expect(contieneOfensivo(undefined)).toBe(false);
    expect(contieneOfensivo(42 as unknown as string)).toBe(false);
  });

  it('un texto enorme se revisa rápido', () => {
    const enorme = 'Hoy jugamos un partido de fútbol con amigos en la cancha del barrio. '.repeat(3000); // ~200 KB
    const t0 = Date.now();
    expect(contieneOfensivo(enorme)).toBe(false);
    expect(contieneOfensivo(enorme + ' puto')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('esNombreReservado', () => {
  it.each([
    'admin',
    'Admin',
    'ADMIN_1',
    'el_admin',
    '4dm1n',
    'aaadmin',
    'administrador',
    'moderador',
    'mod',
    'mod_10',
    'soporte',
    'soporte_clb',
    'support',
    'staff',
    'staffclb',
    'oficial',
    'boca_oficial',
    'official',
    'cortalabocha',
    'Corta_La_Bocha',
    'clb',
    'clbteam',
    'equipoclb',
  ])('"%s" está reservado', (u) => {
    expect(esNombreReservado(u)).toBe(true);
    expect(usuarioPermitido(u)).toBe(false);
  });

  it.each(['Modric10', 'modesto', 'messi10', 'jugador4821', 'riquelme_10', 'Camila', 'Augusto', 'mbappe7', 'el_diez'])('"%s" NO está reservado', (u) => {
    expect(esNombreReservado(u)).toBe(false);
    expect(usuarioPermitido(u)).toBe(true);
  });
});

describe('las listas', () => {
  const todas = [...PALABRAS_PROHIBIDAS, ...RAICES_PROHIBIDAS, ...FRASES_PROHIBIDAS, ...RESERVADOS, ...RESERVADOS_ADENTRO, ...RESERVADOS_AL_BORDE];

  it('están escritas normalizadas: minúsculas, sin tildes, sólo a-z (las frases con espacios)', () => {
    for (const p of [...PALABRAS_PROHIBIDAS, ...RAICES_PROHIBIDAS, ...RESERVADOS, ...RESERVADOS_ADENTRO, ...RESERVADOS_AL_BORDE]) expect([p, /^[a-z]+$/.test(p)]).toEqual([p, true]);
    for (const f of FRASES_PROHIBIDAS) expect([f, /^[a-z]+( [a-z]+)+$/.test(f)]).toEqual([f, true]);
  });

  it('no tienen repetidas', () => {
    for (const lista of [PALABRAS_PROHIBIDAS, RAICES_PROHIBIDAS, FRASES_PROHIBIDAS, RESERVADOS]) expect(new Set(lista).size).toBe(lista.length);
    expect(PALABRAS_PROHIBIDAS.filter((p) => RAICES_PROHIBIDAS.includes(p))).toEqual([]);
  });

  it('cada palabra de la lista se detecta (y las raíces tienen al menos 4 letras)', () => {
    for (const p of [...PALABRAS_PROHIBIDAS, ...RAICES_PROHIBIDAS, ...FRASES_PROHIBIDAS]) expect([p, contieneOfensivo(p)]).toEqual([p, true]);
    for (const r of RAICES_PROHIBIDAS) expect(r.length).toBeGreaterThanOrEqual(4);
    expect(todas.length).toBeGreaterThan(250);
  });
});

// Ninguna respuesta válida del juego puede quedar bloqueada: jugadores, clubes, estadios, DT, palabras…
describe('bancos del juego: nada bloqueado', () => {
  const textos = new Set<string>();
  for (const porLetra of Object.values(AI_ANSWER_BANK)) for (const lista of Object.values(porLetra)) lista.forEach((t) => textos.add(t));
  Object.values(FAKE_EXTRA_ANSWERS).flat().forEach((t) => textos.add(t));
  for (const lista of Object.values(BANCO_IMPOSTOR)) for (const w of lista) [w.texto, ...(w.alias ?? [])].forEach((t) => textos.add(t));
  Object.values(NOMBRES_CATEGORIA).forEach((t) => textos.add(t));
  for (const lista of Object.values(BANCO)) for (const w of lista) [w.texto, w.pista].forEach((t) => textos.add(t));
  for (const p of PREGUNTAS) [p.texto, p.correcta, ...p.incorrectas].forEach((t) => textos.add(t));
  for (const t of Object.values(TEMATICAS_SOPA)) [t.nombre, ...t.palabras].forEach((x) => textos.add(x));
  for (const t of Object.values(TEMAS_MEMOTEST)) [t.nombre, ...t.pares.flat()].forEach((x) => textos.add(x));
  Object.values(TEMATICAS).flat().forEach((t) => textos.add(t));

  it('hay muchos textos para revisar', () => {
    expect(textos.size).toBeGreaterThan(1000);
  });

  it('ninguno es ofensivo', () => {
    expect([...textos].filter((t) => contieneOfensivo(t))).toEqual([]);
  });

  it('ninguno queda bloqueado como nombre de usuario por ofensivo', () => {
    // Como usuario: sin espacios ni signos (así se escribiría "DiMaria", "BocaJuniors"…)
    const comoUsuario = [...textos].map((t) => t.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
    expect(comoUsuario.filter((u) => contieneOfensivo(u))).toEqual([]);
  });
});

// El frontend tiene una copia exacta de la lista y del filtro para avisar antes de enviar
describe('copia del frontend', () => {
  const carpeta = path.resolve(__dirname, '../../../Corta_La_Bocha_Frontend/src/moderacion');
  const leer = (archivo: string) => fs.readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');
  it.each(['palabras.ts', 'filtro.ts'])('%s es igual al del backend', (archivo) => {
    const front = path.join(carpeta, archivo);
    if (!fs.existsSync(path.dirname(carpeta))) return; // el frontend no está al lado (ej. en el CI)
    expect(fs.existsSync(front)).toBe(true);
    expect(leer(front)).toBe(leer(path.join(__dirname, archivo)));
  });
});
