// Filtro de malas palabras. COPIA EXACTA en los dos repos: backend y frontend, src/moderacion/filtro.ts.
// Un test del backend compara los dos archivos: si cambiás algo acá, copialo igual en el otro repo.
// El backend decide; el frontend lo usa sólo para avisar antes de enviar.
//
// Antes de comparar, el texto se normaliza:
//   1. minúsculas y sin tildes ("Ñ" → "n")
//   2. leetspeak: 0→o, 1→i (y otra vuelta con 1→l), 3→e, 4→a, 5→s, 7→t, @→a, $→s. También se lee con los
//      números como separadores ("puto123" → "puto")
//   3. letras estiradas: "puuuto" = "puto" (3 o más iguales seguidas; 2 vocales iguales también, 2 consonantes
//      no: "penne" no es "pene")
//   4. separadores entre letras: "p.u.t.o", "p u t o", "p_u_t_o" → "puto"
// Qué lista va con qué regla está explicado en palabras.ts.
import {
  FRASES_PROHIBIDAS,
  PALABRAS_PROHIBIDAS,
  PREFIJOS_PEGADOS,
  RAICES_PROHIBIDAS,
  RESERVADOS,
  RESERVADOS_ADENTRO,
  RESERVADOS_AL_BORDE,
} from './palabras';

export const MENSAJE_USUARIO = 'Ese nombre de usuario no está permitido. Elegí otro.';
export const MENSAJE_NOMBRE = 'Ese nombre no está permitido. Elegí otro.';
export const MENSAJE_APELLIDO = 'Ese apellido no está permitido. Elegí otro.';
export const MENSAJE_TEXTO = 'Ese texto no está permitido.';
export const MENSAJE_PISTA = 'Esa pista no está permitida.';
export const MENSAJE_ADIVINANZA = 'Esa respuesta no está permitida.';
// Lo que ven los demás en lugar de una respuesta ofensiva del Tutti Frutti
export const TEXTO_OCULTO = '***';

const LEET: Record<string, string> = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
const VOCALES = 'aeiou';

// Minúsculas y sin tildes ("Ñandú" → "nandu")
export function sinTildes(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Las lecturas del texto que se revisan: leetspeak con 1→i, con 1→l, y sin leetspeak (números = separadores)
function lecturas(texto: string): string[] {
  const base = sinTildes(texto);
  const leet = base.replace(/[03457@$]/g, (c) => LEET[c]);
  return [leet.replace(/1/g, 'i'), leet.replace(/1/g, 'l'), base];
}

const palabrasSueltas = (lectura: string) => lectura.split(/[^a-z]+/).filter(Boolean);

// Palabras cortas seguidas (de 1 o 2 letras) se juntan: "p u t o" → "puto", "pu.t.o" → "puto"
function juntarCortas(tokens: string[]): string[] {
  const out: string[] = [];
  let tramo: string[] = [];
  for (const t of [...tokens, '']) {
    if (t && t.length <= 2) {
      tramo.push(t);
      continue;
    }
    if (tramo.length > 1) out.push(tramo.join(''));
    tramo = [];
  }
  return out;
}

// Letras seguidas iguales: "puuuto" → letras "puto", veces [1, 3, 1, 1]
interface Comprimida {
  letras: string;
  veces: number[];
}

function comprimir(palabra: string): Comprimida {
  const letras: string[] = [];
  const veces: number[] = [];
  for (const c of palabra) {
    if (letras[letras.length - 1] === c) veces[veces.length - 1]++;
    else {
      letras.push(c);
      veces.push(1);
    }
  }
  return { letras: letras.join(''), veces };
}

// ¿Lo que escribió el usuario es la palabra prohibida, quizás con letras estiradas?
function coinciden(escrita: Comprimida, prohibida: Comprimida): boolean {
  if (escrita.letras !== prohibida.letras) return false;
  return prohibida.veces.every((v, i) => {
    const e = escrita.veces[i];
    return e === v || (e >= 3 && e >= v) || (e === 2 && v === 1 && VOCALES.includes(prohibida.letras[i]));
  });
}

// Índice por letras comprimidas: buscar una palabra es una sola consulta al Map
const PALABRAS = new Map<string, Comprimida[]>();
for (const p of PALABRAS_PROHIBIDAS) {
  const c = comprimir(p);
  PALABRAS.set(c.letras, [...(PALABRAS.get(c.letras) ?? []), c]);
}
// Raíces y frases: una sola expresión regular para todas. Cada letra puede venir estirada, pero una doble
// tiene que seguir siendo doble ("nigger" → n+i+g{2,}e+r+: así "Nigeria" no coincide)
const patron = (texto: string) => {
  const c = comprimir(texto.replace(/ /g, ''));
  return [...c.letras].map((l, i) => (c.veces[i] === 1 ? `${l}+` : `${l}{${c.veces[i]},}`)).join('');
};
const RAICES = new RegExp(RAICES_PROHIBIDAS.map(patron).join('|'));
const FRASES = new RegExp(FRASES_PROHIBIDAS.map(patron).join('|'));

const esPalabraProhibida = (p: string) => {
  const c = comprimir(p);
  return (PALABRAS.get(c.letras) ?? []).some((x) => coinciden(c, x));
};

// La palabra, sin un prefijo pegado ("reputa" → "puta") y sin plural ("putos" → "puto")
function variantes(p: string): string[] {
  const sinPrefijo = PREFIJOS_PEGADOS.filter((pre) => p.length - pre.length >= 3 && p.startsWith(pre)).map((pre) => p.slice(pre.length));
  return [p, ...sinPrefijo].flatMap((v) => [v, v.replace(/s+$/, ''), v.replace(/e+s+$/, '')]);
}

// ¿El texto tiene un insulto, una grosería, algo discriminatorio o contenido sexual?
export function contieneOfensivo(texto: string | null | undefined): boolean {
  if (typeof texto !== 'string' || !texto) return false;
  return lecturas(texto).some((lectura) => {
    const tokens = palabrasSueltas(lectura);
    if (!tokens.length) return false;
    const palabras = [...tokens, ...juntarCortas(tokens)];
    const todo = tokens.join('');
    if ([...palabras, todo].some((p) => variantes(p).some(esPalabraProhibida))) return true;
    // Las raíces se buscan adentro de cada palabra (separadas por espacios, el patrón nunca cruza de una a otra)
    if (RAICES.test(palabras.join(' '))) return true;
    return FRASES.test(todo);
  });
}

const RES_EXACTOS = new Set(RESERVADOS.map((r) => comprimir(r).letras));
const RES_ADENTRO = RESERVADOS_ADENTRO.map((r) => comprimir(r).letras);
const RES_BORDE = RESERVADOS_AL_BORDE.map((r) => comprimir(r).letras);

// ¿El nombre de usuario hace pasar a alguien por el equipo o la app? (admin, moderador, soporte, clb…)
export function esNombreReservado(usuario: string | null | undefined): boolean {
  if (typeof usuario !== 'string' || !usuario) return false;
  return lecturas(usuario).some((lectura) => {
    const tokens = palabrasSueltas(lectura).map((t) => comprimir(t).letras);
    const junto = comprimir(tokens.join('')).letras;
    if (!junto) return false;
    return (
      [...tokens, junto].some((t) => RES_EXACTOS.has(t)) ||
      RES_ADENTRO.some((r) => junto.includes(r)) ||
      RES_BORDE.some((r) => junto.startsWith(r) || junto.endsWith(r))
    );
  });
}

// Nombre de usuario permitido: ni ofensivo ni reservado
export const usuarioPermitido = (usuario: string) => !contieneOfensivo(usuario) && !esNombreReservado(usuario);
