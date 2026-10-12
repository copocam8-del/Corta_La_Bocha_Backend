import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { GameResultsService } from '../games/game-results.service';
import { BANCO, type Dificultad, type Pista } from './ahorcado-bank';
import { completa, esLetra, MAX_ERRORES, mascara, mismaRespuesta, normalizar, puntos } from './ahorcado-rules';

// Estado secreto de la partida (matches.state). Nunca se manda entero al navegador.
interface EstadoAhorcado {
  respuesta: string;
  pista: Pista;
  dificultad: Dificultad;
  adivinadas: string[]; // letras acertadas
  erradas: string[]; // letras erradas
  intentosFallidos: number; // palabras arriesgadas que no eran
  inicio: number; // ms
}

const ABANDONO_MS = 30 * 60 * 1000;

@Injectable()
export class AhorcadoService {
  constructor(private readonly results: GameResultsService) {}

  async empezar(userId: string, dificultad: Dificultad, azar = Math.random) {
    // Las que dejó sin terminar hace más de 30 minutos cuentan como perdidas
    await this.results.closeAbandoned(userId, 'ahorcado', ABANDONO_MS);
    const lista = BANCO[dificultad];
    const elegida = lista[Math.floor(azar() * lista.length)];
    const estado: EstadoAhorcado = {
      respuesta: elegida.texto,
      pista: elegida.pista,
      dificultad,
      adivinadas: [],
      erradas: [],
      intentosFallidos: 0,
      inicio: Date.now(),
    };
    const match = await this.results.createMatch(userId, 'ahorcado', { ...estado }, dificultad);
    return this.vista(match.id, estado);
  }

  async letra(userId: string, matchId: string, letraCruda: string) {
    const letra = normalizar((letraCruda ?? '').trim());
    if (letra.length !== 1 || !esLetra(letra)) throw new BadRequestException('Mandá una sola letra (A a Z o Ñ).');
    const { estado } = await this.cargar(userId, matchId);
    if (estado.adivinadas.includes(letra) || estado.erradas.includes(letra)) {
      throw new BadRequestException('Esa letra ya la probaste.');
    }
    if (normalizar(estado.respuesta).includes(letra)) estado.adivinadas.push(letra);
    else estado.erradas.push(letra);
    return this.avanzar(userId, matchId, estado);
  }

  async arriesgar(userId: string, matchId: string, intento: string) {
    if (!intento?.trim()) throw new BadRequestException('Escribí la respuesta que querés arriesgar.');
    const { estado } = await this.cargar(userId, matchId);
    if (mismaRespuesta(intento, estado.respuesta)) {
      estado.adivinadas = [...new Set([...estado.adivinadas, ...[...normalizar(estado.respuesta)].filter(esLetra)])];
    } else {
      estado.intentosFallidos += 1; // arriesgar mal cuesta un error
    }
    return this.avanzar(userId, matchId, estado);
  }

  async rendirse(userId: string, matchId: string) {
    const { estado } = await this.cargar(userId, matchId);
    return this.terminar(userId, matchId, estado, false);
  }

  private async cargar(userId: string, matchId: string) {
    const match = await this.results.loadActive(userId, matchId, 'ahorcado');
    return { estado: match.state as unknown as EstadoAhorcado };
  }

  private errores(e: EstadoAhorcado) {
    return e.erradas.length + e.intentosFallidos;
  }

  private async avanzar(userId: string, matchId: string, estado: EstadoAhorcado) {
    if (completa(estado.respuesta, estado.adivinadas)) return this.terminar(userId, matchId, estado, true);
    if (this.errores(estado) >= MAX_ERRORES) return this.terminar(userId, matchId, estado, false);
    await this.results.saveState(matchId, { ...estado });
    return this.vista(matchId, estado);
  }

  private async terminar(userId: string, matchId: string, estado: EstadoAhorcado, gano: boolean) {
    const segundos = Math.round((Date.now() - estado.inicio) / 1000);
    const errores = this.errores(estado);
    const pts = puntos(estado.dificultad, errores, segundos, gano);
    const res = await this.results.finish(
      userId,
      matchId,
      'ahorcado',
      { points: pts, won: gano, extra: { errores, dificultad: estado.dificultad, segundos } },
      { ...estado },
    );
    if (!res) throw new ConflictException('Esta partida ya terminó');
    return {
      ...this.vista(matchId, estado),
      terminada: true,
      gano,
      respuesta: estado.respuesta, // recién ahora se muestra (con tildes)
      puntos: pts,
      segundos,
      logros: res.newAchievements,
      estadisticas: res.gameStats,
    };
  }

  // Lo que ve el jugador mientras juega: nunca la respuesta
  private vista(matchId: string, e: EstadoAhorcado) {
    return {
      matchId,
      pista: e.pista,
      dificultad: e.dificultad,
      mascara: mascara(e.respuesta, e.adivinadas),
      adivinadas: e.adivinadas,
      erradas: e.erradas,
      errores: this.errores(e),
      maxErrores: MAX_ERRORES,
      terminada: false,
    };
  }
}
