import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { GameResultsService } from '../games/game-results.service';
import { ContenidoVistoService } from '../games/contenido-visto.service';
import { CATEGORIAS_TRIVIA, PREGUNTAS, type CategoriaTrivia, type DificultadTrivia } from './trivia-bank';
import {
  ACIERTOS_PARA_GANAR, elegirPreguntas, GRACIA_MS, prepararPregunta, preguntaPorId, puntosRespuesta,
  SEGUNDOS_POR_PREGUNTA, type PreguntaEnJuego,
} from './trivia-rules';

// Estado secreto (matches.state): las preguntas con el índice de la opción correcta
interface EstadoTrivia {
  preguntas: PreguntaEnJuego[];
  actual: number; // índice de la pregunta que se está respondiendo
  inicioPregunta: number; // ms: cuándo se mandó la pregunta actual (lo mide el servidor)
  respuestas: { opcion: number | null; correcta: boolean; ms: number; puntos: number }[];
}

const ABANDONO_MS = 30 * 60 * 1000;

@Injectable()
export class TriviaService {
  constructor(
    private readonly results: GameResultsService,
    private readonly vistos: ContenidoVistoService,
  ) {}

  categorias() {
    return CATEGORIAS_TRIVIA.map((c) => ({ id: c, preguntas: PREGUNTAS.filter((p) => p.categoria === c).length }));
  }

  async empezar(userId: string, filtro: { categoria?: CategoriaTrivia; dificultad?: DificultadTrivia }, azar = Math.random) {
    await this.results.closeAbandoned(userId, 'trivia', ABANDONO_MS);
    // Primero las preguntas que no vio (con esos filtros); al agotarlas vuelve a empezar
    const vistos = await this.vistos.leer([userId], 'trivia');
    const elegidas = elegirPreguntas(azar, filtro, undefined, vistos);
    if (elegidas.length < 5) throw new BadRequestException('No hay suficientes preguntas con ese filtro.');
    const estado: EstadoTrivia = {
      preguntas: elegidas.map((p) => prepararPregunta(p, azar)),
      actual: 0,
      inicioPregunta: Date.now(),
      respuestas: [],
    };
    const match = await this.results.createMatch(userId, 'trivia', { ...estado }, filtro.dificultad ?? 'mixta');
    await this.vistos.marcar([userId], 'trivia', elegidas.map((p) => p.id));
    return { matchId: match.id, total: estado.preguntas.length, puntos: 0, aciertos: 0, pregunta: this.pregunta(estado) };
  }

  async responder(userId: string, matchId: string, opcion: number | null) {
    const match = await this.results.loadActive(userId, matchId, 'trivia');
    const estado = match.state as unknown as EstadoTrivia;
    const enJuego = estado.preguntas[estado.actual];
    if (!enJuego) throw new ConflictException('Esta partida ya terminó');
    if (opcion !== null && (!Number.isInteger(opcion) || opcion < 0 || opcion >= enJuego.opciones.length)) {
      throw new BadRequestException('Opción inválida.');
    }

    // El tiempo lo mide el servidor: si llegó tarde, no vale aunque sea la correcta
    const ms = Date.now() - estado.inicioPregunta;
    const aTiempo = ms <= SEGUNDOS_POR_PREGUNTA * 1000 + GRACIA_MS;
    const correcta = aTiempo && opcion === enJuego.correcta;
    const puntos = puntosRespuesta(preguntaPorId(enJuego.id).dificultad, correcta, ms);
    estado.respuestas.push({ opcion, correcta, ms, puntos });
    estado.actual += 1;
    estado.inicioPregunta = Date.now();

    const resumen = {
      correcta,
      aTiempo,
      opcionCorrecta: enJuego.correcta,
      puntosPregunta: puntos,
      puntos: estado.respuestas.reduce((s, r) => s + r.puntos, 0),
      aciertos: estado.respuestas.filter((r) => r.correcta).length,
      total: estado.preguntas.length,
    };

    if (estado.actual < estado.preguntas.length) {
      await this.results.saveState(matchId, { ...estado });
      return { ...resumen, terminada: false, pregunta: this.pregunta(estado) };
    }

    // Última pregunta: se termina y se registra el resultado (una sola vez)
    const gano = resumen.aciertos >= ACIERTOS_PARA_GANAR;
    const promedioSegundos = Math.round(estado.respuestas.reduce((s, r) => s + r.ms, 0) / estado.respuestas.length / 100) / 10;
    const res = await this.results.finish(
      userId,
      matchId,
      'trivia',
      { points: resumen.puntos, won: gano, extra: { aciertos: resumen.aciertos, total: resumen.total, promedioSegundos } },
      { ...estado },
    );
    if (!res) throw new ConflictException('Esta partida ya terminó');
    return { ...resumen, terminada: true, gano, promedioSegundos, logros: res.newAchievements, pregunta: null };
  }

  // Lo que ve el jugador: texto y opciones, nunca cuál es la correcta
  private pregunta(e: EstadoTrivia) {
    const enJuego = e.preguntas[e.actual];
    const p = preguntaPorId(enJuego.id);
    return {
      numero: e.actual + 1,
      texto: p.texto,
      categoria: p.categoria,
      dificultad: p.dificultad,
      opciones: enJuego.opciones,
      segundos: SEGUNDOS_POR_PREGUNTA,
    };
  }
}
