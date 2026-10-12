import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GameResultsService } from '../games/game-results.service';
import { argentinaDay } from '../stats/periods';
import { GRACIA_MS, preguntaPorId, puntosRespuesta, SEGUNDOS_POR_PREGUNTA, type PreguntaEnJuego } from '../trivia/trivia-rules';
import { ACIERTOS_PARA_GANAR, diaAnterior, msHastaMedianoche, preguntasDelDia, textoCompartir, type Marca } from './desafio-rules';

interface EstadoDesafio {
  dia: string;
  preguntas: PreguntaEnJuego[];
  actual: number;
  inicioPregunta: number;
  respuestas: { opcion: number | null; marca: Marca; ms: number; puntos: number }[];
}

const LIMITE_MS = SEGUNDOS_POR_PREGUNTA * 1000;

@Injectable()
export class DesafioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly results: GameResultsService,
  ) {}

  // Estado del desafío de hoy para el usuario: si ya lo jugó, su resultado y la racha
  async hoy(userId: string, now = Date.now()) {
    const dia = argentinaDay(new Date(now));
    const fila = await this.prisma.daily_challenges.findUnique({ where: { user_id_day: { user_id: userId, day: dia } } });
    const racha = await this.rachaActual(userId, dia, fila);
    const base = { dia, preguntas: preguntasDelDia(dia).length, proximoEnMs: msHastaMedianoche(now), racha };
    if (fila?.completed) {
      return {
        ...base,
        jugado: true,
        enCurso: false,
        resultado: { aciertos: fila.aciertos, puntos: fila.puntos, marcas: fila.resultado, segundos: Math.round(fila.ms_total / 100) / 10 },
        compartir: textoCompartir(dia, fila.resultado, fila.aciertos, fila.racha),
      };
    }
    return { ...base, jugado: false, enCurso: !!fila };
  }

  // Empieza el de hoy (o lo retoma si se cortó a la mitad). Una sola vez por día.
  async empezar(userId: string, now = Date.now()) {
    const dia = argentinaDay(new Date(now));
    let fila = await this.prisma.daily_challenges.findUnique({ where: { user_id_day: { user_id: userId, day: dia } } });
    if (fila?.completed) throw new ConflictException('Ya jugaste el desafío de hoy. ¡Volvé mañana!');

    if (!fila) {
      const estado: EstadoDesafio = { dia, preguntas: preguntasDelDia(dia), actual: 0, inicioPregunta: now, respuestas: [] };
      const match = await this.results.createMatch(userId, 'trivia_diaria', { ...estado });
      try {
        fila = await this.prisma.daily_challenges.create({ data: { user_id: userId, day: dia, match_id: match.id } });
      } catch (e) {
        // Dos pestañas a la vez: la otra ya lo creó. Se descarta esta partida y se usa la otra.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          await this.prisma.matches.delete({ where: { id: match.id } }).catch(() => undefined);
          fila = await this.prisma.daily_challenges.findUnique({ where: { user_id_day: { user_id: userId, day: dia } } });
          if (!fila) throw e;
        } else throw e;
      }
    }

    const match = await this.results.loadActive(userId, fila.match_id, 'trivia_diaria');
    const estado = match.state as unknown as EstadoDesafio;
    // Si al volver la pregunta actual ya venció, cuenta como "sin tiempo" y sigue la próxima
    if (now - estado.inicioPregunta > LIMITE_MS + GRACIA_MS) {
      const res = await this.registrar(userId, fila.match_id, estado, null, now);
      if (res.terminada) return res;
    }
    return { matchId: fila.match_id, dia, total: estado.preguntas.length, ...this.marcador(estado), pregunta: this.pregunta(estado, now) };
  }

  async responder(userId: string, matchId: string, opcion: number | null, now = Date.now()) {
    const match = await this.results.loadActive(userId, matchId, 'trivia_diaria');
    const estado = match.state as unknown as EstadoDesafio;
    const enJuego = estado.preguntas[estado.actual];
    if (!enJuego) throw new ConflictException('Este desafío ya terminó');
    if (opcion !== null && (!Number.isInteger(opcion) || opcion < 0 || opcion >= enJuego.opciones.length)) {
      throw new BadRequestException('Opción inválida.');
    }
    return this.registrar(userId, matchId, estado, opcion, now);
  }

  // Tabla del día: los que lo terminaron, por aciertos, puntos y tiempo. Con mi posición.
  async tabla(userId: string, dia = argentinaDay()) {
    const filas = await this.prisma.daily_challenges.findMany({
      where: { day: dia, completed: true },
      orderBy: [{ aciertos: 'desc' }, { puntos: 'desc' }, { ms_total: 'asc' }],
      select: { user_id: true, aciertos: true, puntos: true, ms_total: true, racha: true, user: { select: { username: true } } },
    });
    const lista = filas.map((f, i) => ({
      posicion: i + 1,
      userId: f.user_id,
      username: f.user.username,
      aciertos: f.aciertos,
      puntos: f.puntos,
      segundos: Math.round(f.ms_total / 100) / 10,
      racha: f.racha,
    }));
    return { dia, jugadores: lista.length, top: lista.slice(0, 50), yo: lista.find((l) => l.userId === userId) ?? null };
  }

  // ── internos ───────────────────────────────────────────────────────────────────────────

  private async registrar(userId: string, matchId: string, estado: EstadoDesafio, opcion: number | null, now: number) {
    const enJuego = estado.preguntas[estado.actual];
    const ms = now - estado.inicioPregunta;
    const aTiempo = ms <= LIMITE_MS + GRACIA_MS;
    const correcta = aTiempo && opcion === enJuego.correcta;
    const marca: Marca = correcta ? 'V' : !aTiempo || opcion === null ? 'T' : 'X';
    const puntos = puntosRespuesta(preguntaPorId(enJuego.id).dificultad, correcta, ms);
    estado.respuestas.push({ opcion, marca, ms: Math.min(ms, LIMITE_MS), puntos });
    estado.actual += 1;
    estado.inicioPregunta = now;
    const resumen = { correcta, aTiempo, opcionCorrecta: enJuego.correcta, puntosPregunta: puntos, ...this.marcador(estado), total: estado.preguntas.length };

    if (estado.actual < estado.preguntas.length) {
      await this.results.saveState(matchId, { ...estado });
      return { ...resumen, matchId, terminada: false, pregunta: this.pregunta(estado, now) };
    }

    // Terminó: racha (días seguidos), fila del día y estadísticas (una sola vez)
    const marcas = estado.respuestas.map((r) => r.marca).join('');
    const msTotal = estado.respuestas.reduce((s, r) => s + r.ms, 0);
    const ayer = await this.prisma.daily_challenges.findUnique({
      where: { user_id_day: { user_id: userId, day: diaAnterior(estado.dia) } },
    });
    const racha = (ayer?.completed ? ayer.racha : 0) + 1;
    const gano = resumen.aciertos >= ACIERTOS_PARA_GANAR;
    const res = await this.results.finish(
      userId,
      matchId,
      'trivia_diaria',
      { points: resumen.puntos, won: gano, extra: { aciertos: resumen.aciertos, total: estado.preguntas.length, racha } },
      { ...estado },
    );
    if (!res) throw new ConflictException('Este desafío ya terminó');
    await this.prisma.daily_challenges.update({
      where: { match_id: matchId },
      data: { completed: true, aciertos: resumen.aciertos, puntos: resumen.puntos, ms_total: msTotal, resultado: marcas, racha, finished_at: new Date(now) },
    });
    return {
      ...resumen,
      matchId,
      terminada: true,
      gano,
      racha,
      marcas,
      compartir: textoCompartir(estado.dia, marcas, resumen.aciertos, racha),
      logros: res.newAchievements,
      proximoEnMs: msHastaMedianoche(now),
      pregunta: null,
    };
  }

  private marcador(e: EstadoDesafio) {
    return { puntos: e.respuestas.reduce((s, r) => s + r.puntos, 0), aciertos: e.respuestas.filter((r) => r.marca === 'V').length };
  }

  private pregunta(e: EstadoDesafio, now: number) {
    const enJuego = e.preguntas[e.actual];
    const p = preguntaPorId(enJuego.id);
    const restantes = Math.max(0, Math.ceil((LIMITE_MS - (now - e.inicioPregunta)) / 1000));
    return { numero: e.actual + 1, texto: p.texto, categoria: p.categoria, dificultad: p.dificultad, opciones: enJuego.opciones, segundos: SEGUNDOS_POR_PREGUNTA, restantes };
  }

  private async rachaActual(userId: string, dia: string, hoy: { completed: boolean; racha: number } | null) {
    if (hoy?.completed) return hoy.racha;
    const ayer = await this.prisma.daily_challenges.findUnique({ where: { user_id_day: { user_id: userId, day: diaAnterior(dia) } } });
    return ayer?.completed ? ayer.racha : 0; // si no jugó ayer, la racha se cortó
  }
}
