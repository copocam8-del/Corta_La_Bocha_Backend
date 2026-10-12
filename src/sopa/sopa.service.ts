import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { GameResultsService } from '../games/game-results.service';
import {
  buscarPalabra, celdasDe, celdasDeLinea, CONFIG_SOPA, generarSopa, GRACIA_MS, puntosSopa, TEMATICAS_SOPA,
  type DificultadSopa, type Sopa, type TematicaSopa,
} from './sopa-rules';

interface EstadoSopa {
  tematica: TematicaSopa;
  dificultad: DificultadSopa;
  sopa: Sopa;
  encontradas: string[];
  inicio: number;
}

interface Celda {
  f: number;
  c: number;
}

const ABANDONO_MS = 30 * 60 * 1000;

@Injectable()
export class SopaService {
  constructor(private readonly results: GameResultsService) {}

  tematicas() {
    return Object.entries(TEMATICAS_SOPA).map(([id, t]) => ({ id, nombre: t.nombre }));
  }

  async empezar(userId: string, tematica: TematicaSopa, dificultad: DificultadSopa, azar = Math.random) {
    await this.results.closeAbandoned(userId, 'sopa_de_letras', ABANDONO_MS);
    const estado: EstadoSopa = { tematica, dificultad, sopa: generarSopa(tematica, dificultad, azar), encontradas: [], inicio: Date.now() };
    const match = await this.results.createMatch(userId, 'sopa_de_letras', { ...estado }, dificultad);
    return this.vista(match.id, estado);
  }

  async marcar(userId: string, matchId: string, desde: Celda, hasta: Celda, now = Date.now()) {
    const match = await this.results.loadActive(userId, matchId, 'sopa_de_letras');
    const estado = match.state as unknown as EstadoSopa;
    const tamano = estado.sopa.grilla.length;
    for (const p of [desde, hasta]) {
      if (!Number.isInteger(p?.f) || !Number.isInteger(p?.c) || p.f < 0 || p.c < 0 || p.f >= tamano || p.c >= tamano) {
        throw new BadRequestException('Celda fuera de la grilla.');
      }
    }
    // Se terminó el tiempo: la partida termina con lo que encontró
    if (now - estado.inicio > CONFIG_SOPA[estado.dificultad].segundos * 1000 + GRACIA_MS) {
      return this.terminar(userId, matchId, estado, now);
    }
    if (!celdasDeLinea(desde, hasta)) return { ...this.vista(matchId, estado, now), ok: false, motivo: 'Marcá en línea recta.' };

    const u = buscarPalabra(estado.sopa, desde, hasta);
    if (!u) return { ...this.vista(matchId, estado, now), ok: false, motivo: 'Ahí no hay ninguna palabra.' };
    if (estado.encontradas.includes(u.palabra)) return { ...this.vista(matchId, estado, now), ok: false, motivo: 'Esa ya la encontraste.' };

    estado.encontradas.push(u.palabra);
    if (estado.encontradas.length === estado.sopa.ubicaciones.length) return this.terminar(userId, matchId, estado, now);
    await this.results.saveState(matchId, { ...estado });
    return { ...this.vista(matchId, estado, now), ok: true, palabra: u.palabra };
  }

  // Rendirse o se acabó el tiempo
  async terminarAhora(userId: string, matchId: string) {
    const match = await this.results.loadActive(userId, matchId, 'sopa_de_letras');
    return this.terminar(userId, matchId, match.state as unknown as EstadoSopa, Date.now());
  }

  private async terminar(userId: string, matchId: string, estado: EstadoSopa, now: number) {
    const limite = CONFIG_SOPA[estado.dificultad].segundos;
    const segundos = Math.min(limite, Math.round((now - estado.inicio) / 1000));
    const total = estado.sopa.ubicaciones.length;
    const gano = estado.encontradas.length === total;
    const puntos = puntosSopa(estado.dificultad, estado.encontradas, total, limite - segundos);
    const res = await this.results.finish(
      userId,
      matchId,
      'sopa_de_letras',
      { points: puntos, won: gano, extra: { encontradas: estado.encontradas.length, total, segundos, dificultad: estado.dificultad } },
      { ...estado },
    );
    if (!res) throw new ConflictException('Esta partida ya terminó');
    return {
      ...this.vista(matchId, estado, now),
      terminada: true,
      gano,
      puntos,
      segundos,
      // Al final se muestran todas (también las que no encontró)
      todas: estado.sopa.ubicaciones.map((u) => ({ palabra: u.palabra, celdas: celdasDe(u) })),
      logros: res.newAchievements,
    };
  }

  // Lo que ve el jugador: la grilla, la lista de palabras y dónde están SÓLO las que ya encontró
  private vista(matchId: string, e: EstadoSopa, now = Date.now()) {
    const limite = CONFIG_SOPA[e.dificultad].segundos;
    return {
      matchId,
      tematica: TEMATICAS_SOPA[e.tematica].nombre,
      dificultad: e.dificultad,
      grilla: e.sopa.grilla,
      palabras: e.sopa.ubicaciones.map((u) => u.palabra).sort(),
      encontradas: e.sopa.ubicaciones.filter((u) => e.encontradas.includes(u.palabra)).map((u) => ({ palabra: u.palabra, celdas: celdasDe(u) })),
      segundos: limite,
      restantes: Math.max(0, Math.ceil((e.inicio + limite * 1000 - now) / 1000)),
      terminada: false,
    };
  }
}
