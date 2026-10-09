import { AI_ANSWER_BANK } from './ai-answer-bank';
import { LETRAS, TEMATICAS } from './solo-quick';
import { compareKey, precheckAnswer } from '../tutti-frutti/answer-rules';
import { VALID_CATEGORIES } from '../tutti-frutti/tutti-frutti.service';

const categoriasDelJuego = [...new Set(Object.values(TEMATICAS).flat())];

describe('banco de respuestas de la máquina', () => {
  it('tiene todas las categorías del juego y todas las letras que se sortean', () => {
    for (const categoria of categoriasDelJuego) {
      expect(AI_ANSWER_BANK[categoria]).toBeDefined();
      expect(Object.keys(AI_ANSWER_BANK[categoria]).sort()).toEqual([...LETRAS].sort());
    }
  });

  it('todas las categorías del juego son categorías que el validador conoce', () => {
    for (const categoria of categoriasDelJuego) expect(VALID_CATEGORIES).toContain(categoria);
  });

  it('cada respuesta empieza con su letra (con las mismas reglas que los jugadores)', () => {
    const errores: string[] = [];
    for (const [categoria, porLetra] of Object.entries(AI_ANSWER_BANK)) {
      for (const [letra, respuestas] of Object.entries(porLetra)) {
        for (const r of respuestas) {
          const check = precheckAnswer(r, letra, categoria);
          if (!check.ok) errores.push(`${categoria} / ${letra}: "${r}" → ${check.reason}`);
        }
      }
    }
    expect(errores).toEqual([]);
  });

  it('no repite la misma respuesta dentro de una letra', () => {
    for (const [categoria, porLetra] of Object.entries(AI_ANSWER_BANK)) {
      for (const [letra, respuestas] of Object.entries(porLetra)) {
        const claves = respuestas.map((r) => compareKey(r, categoria));
        expect({ categoria, letra, repetidas: claves.length - new Set(claves).size }).toEqual({
          categoria,
          letra,
          repetidas: 0,
        });
      }
    }
  });

  it('las categorías "abiertas" tienen respuesta para todas las letras', () => {
    // Las demás (ej. País Sede o Selección Campeona) tienen pocas respuestas reales posibles
    for (const categoria of ['Jugador', 'Equipo', 'DT', 'Selección', 'Jugador Argentino', 'Goleador']) {
      for (const letra of LETRAS) {
        expect({ categoria, letra, cantidad: AI_ANSWER_BANK[categoria][letra].length > 0 }).toEqual({
          categoria,
          letra,
          cantidad: true,
        });
      }
    }
  });
});
