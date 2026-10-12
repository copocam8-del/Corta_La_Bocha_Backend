import { ahorcado } from './ahorcado.mode';
import { memotest } from './memotest.mode';
import { sopa } from './sopa.mode';
import { trivia } from './trivia.mode';
import { tuttiFrutti } from './tutti-frutti.mode';
import type { ModeDefinition, MultiGameId } from './types';

// Juegos con multijugador. Para sumar uno: escribí su modo (ver round-mode.ts) y agregalo acá.
export const MODES: Record<MultiGameId, ModeDefinition> = {
  tutti_frutti: tuttiFrutti,
  ahorcado,
  trivia,
  sopa_de_letras: sopa,
  memotest,
};

export * from './types';
