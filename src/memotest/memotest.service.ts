import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { GameResultsService } from '../games/game-results.service';
import {
  armarMazo, GRACIA_MS, NIVELES_MEMOTEST, puntosMemotest, TEMAS_MEMOTEST,
  type Carta, type NivelMemotest, type TemaMemotest,
} from './memotest-rules';

interface EstadoMemotest {
  tema: TemaMemotest;
  nivel: NivelMemotest;
  mazo: Carta[];
  encontrados: number[]; // índices de par ya encontrados
  abierta: number | null; // primera carta del intento actual
  movimientos: number; // intentos (cada dos cartas)
  inicio: number;
}

const ABANDONO_MS = 30 * 60 * 1000;

@Injectable()
export class MemotestService {
  constructor(private readonly results: GameResultsService) {}

  temas() {
    return Object.entries(TEMAS_MEMOTEST).map(([id, t]) => ({ id, nombre: t.nombre }));
  }

  async empezar(userId: string, tema: TemaMemotest, nivel: NivelMemotest, azar = Math.random) {
    await this.results.closeAbandoned(userId, 'memotest', ABANDONO_MS);
    const estado: EstadoMemotest = { tema, nivel, mazo: armarMazo(tema, nivel, azar), encontrados: [], abierta: null, movimientos: 0, inicio: Date.now() };
    const match = await this.results.createMatch(userId, 'memotest', { ...estado }, nivel);
    return this.vista(match.id, estado);
  }

  async voltear(userId: string, matchId: string, indice: number, now = Date.now()) {
    const match = await this.results.loadActive(userId, matchId, 'memotest');
    const e = match.state as unknown as EstadoMemotest;
    if (!Number.isInteger(indice) || indice < 0 || indice >= e.mazo.length) throw new BadRequestException('Carta inválida.');
    if (now - e.inicio > NIVELES_MEMOTEST[e.nivel].segundos * 1000 + GRACIA_MS) return this.terminar(userId, matchId, e, now);
    if (e.encontrados.includes(e.mazo[indice].par)) throw new BadRequestException('Esa carta ya está descubierta.');
    if (e.abierta === indice) throw new BadRequestException('Esa carta ya está dada vuelta.');

    const carta = { indice, texto: e.mazo[indice].texto, icono: e.mazo[indice].icono };
    if (e.abierta === null) {
      // Primera carta del intento
      e.abierta = indice;
      await this.results.saveState(matchId, { ...e });
      return { ...this.vista(matchId, e, now), carta };
    }

    // Segunda carta: ¿es par?
    const primera = e.abierta;
    const par = e.mazo[primera].par === e.mazo[indice].par;
    e.abierta = null;
    e.movimientos += 1;
    if (par) e.encontrados.push(e.mazo[indice].par);
    const resultado = { carta, primera: { indice: primera, texto: e.mazo[primera].texto, icono: e.mazo[primera].icono }, par };
    if (e.encontrados.length === NIVELES_MEMOTEST[e.nivel].pares) {
      return { ...(await this.terminar(userId, matchId, e, now)), ...resultado };
    }
    await this.results.saveState(matchId, { ...e });
    return { ...this.vista(matchId, e, now), ...resultado };
  }

  async rendirse(userId: string, matchId: string) {
    const match = await this.results.loadActive(userId, matchId, 'memotest');
    return this.terminar(userId, matchId, match.state as unknown as EstadoMemotest, Date.now());
  }

  private async terminar(userId: string, matchId: string, e: EstadoMemotest, now: number) {
    const { pares, segundos: limite } = NIVELES_MEMOTEST[e.nivel];
    const segundos = Math.min(limite, Math.round((now - e.inicio) / 1000));
    const completo = e.encontrados.length === pares;
    const puntos = puntosMemotest(e.nivel, completo, e.encontrados.length, e.movimientos, segundos);
    const res = await this.results.finish(
      userId,
      matchId,
      'memotest',
      { points: puntos, won: completo, extra: { movimientos: e.movimientos, pares, segundos, nivel: e.nivel } },
      { ...e },
    );
    if (!res) throw new ConflictException('Esta partida ya terminó');
    return {
      ...this.vista(matchId, e, now),
      terminada: true,
      gano: completo,
      puntos,
      segundos,
      mazo: e.mazo.map((c) => ({ texto: c.texto, icono: c.icono, par: c.par })), // al final se ve todo
      logros: res.newAchievements,
    };
  }

  // Lo que ve el jugador: cuántas cartas hay y SÓLO el contenido de las ya encontradas
  private vista(matchId: string, e: EstadoMemotest, now = Date.now()) {
    const { pares, segundos } = NIVELES_MEMOTEST[e.nivel];
    return {
      matchId,
      tema: TEMAS_MEMOTEST[e.tema].nombre,
      nivel: e.nivel,
      cartas: e.mazo.length,
      pares,
      descubiertas: e.mazo
        .map((c, indice) => ({ indice, texto: c.texto, icono: c.icono, par: c.par }))
        .filter((c) => e.encontrados.includes(c.par))
        .map(({ indice, texto, icono }) => ({ indice, texto, icono })),
      movimientos: e.movimientos,
      encontrados: e.encontrados.length,
      segundos,
      restantes: Math.max(0, Math.ceil((e.inicio + segundos * 1000 - now) / 1000)),
      terminada: false,
    };
  }
}
