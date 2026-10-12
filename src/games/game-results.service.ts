import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService, UnlockedAchievement } from '../achievements/achievements.service';
import type { GameId } from './games';

export interface GameOutcome {
  points: number;
  won: boolean;
  // Datos propios del juego para los logros (ej. { errores: 0, segundos: 40 })
  extra?: Record<string, number | boolean | string>;
}

// Lo común a todos los juegos de un jugador (ahorcado, trivia, sopa, memotest…):
// crear la partida con su estado secreto, cargarla controlando que sea del usuario, "reservarla"
// para que no se termine dos veces y registrar el resultado (estadísticas generales y del juego,
// ligas y logros) en una sola transacción. El resultado y los puntos los decide cada juego en el
// servidor; acá sólo se guardan.
@Injectable()
export class GameResultsService {
  constructor(
    private prisma: PrismaService,
    private stats: StatsService,
    private achievements: AchievementsService,
  ) {}

  createMatch(userId: string, game: GameId, state: Prisma.InputJsonValue, difficulty?: string) {
    return this.prisma.matches.create({
      data: { user_id: userId, mode: 'solo', game, ai_difficulty: difficulty ?? null, status: 'in_progress', state },
    });
  }

  // Partida en curso del usuario (404 si no existe o es de otro; 409 si ya terminó)
  async loadActive(userId: string, matchId: string, game: GameId) {
    const match = await this.prisma.matches.findUnique({ where: { id: matchId } });
    if (!match || match.user_id !== userId || match.game !== game) throw new NotFoundException('Partida no encontrada');
    if (match.status !== 'in_progress') throw new ConflictException('Esta partida ya terminó');
    return match;
  }

  // Guarda el estado nuevo sólo si la partida sigue en curso (evita pisar una que se terminó)
  async saveState(matchId: string, state: Prisma.InputJsonValue) {
    const res = await this.prisma.matches.updateMany({ where: { id: matchId, status: 'in_progress' }, data: { state } });
    if (res.count === 0) throw new ConflictException('Esta partida ya terminó');
  }

  /**
   * Termina la partida UNA sola vez y registra el resultado. Devuelve null si ya estaba terminada.
   */
  async finish(
    userId: string,
    matchId: string,
    game: GameId,
    outcome: GameOutcome,
    finalState?: Prisma.InputJsonValue,
  ): Promise<{ newAchievements: UnlockedAchievement[]; totalPoints: number; gameStats: { matchesPlayed: number; matchesWon: number; totalPoints: number; bestStreak: number } } | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.matches.updateMany({
        where: { id: matchId, user_id: userId, status: 'in_progress' },
        data: { status: 'finished', finished_at: new Date(), ...(finalState !== undefined ? { state: finalState } : {}) },
      });
      if (claimed.count === 0) return null;
      return this.recordInTx(tx, userId, matchId, game, outcome);
    });
  }

  private async recordInTx(tx: Prisma.TransactionClient, userId: string, matchId: string, game: GameId, outcome: GameOutcome) {
    const points = Math.max(0, Math.round(outcome.points));
    const profile = await this.stats.recordMatchResult(userId, { won: outcome.won, points, game }, tx);
    await this.stats.logResult(tx, matchId, { userId, game, points, won: outcome.won, abandoned: false });
    const gs = profile.game_stats;
    const newAchievements = await this.achievements.unlockFor(
      userId,
      {
        matchesPlayed: profile.matches_played,
        matchesWon: profile.matches_won,
        totalPoints: profile.total_points,
        currentStreak: profile.current_streak,
        game,
        mode: 'solo',
        won: outcome.won,
        points,
        gameMatchesPlayed: gs.matches_played,
        gameMatchesWon: gs.matches_won,
        gameTotalPoints: gs.total_points,
        gameCurrentStreak: gs.current_streak,
        extra: outcome.extra,
      },
      tx,
    );
    return {
      newAchievements,
      totalPoints: profile.total_points,
      gameStats: {
        matchesPlayed: gs.matches_played,
        matchesWon: gs.matches_won,
        totalPoints: gs.total_points,
        bestStreak: gs.best_streak,
      },
    };
  }

  // Partidas de ese juego que el usuario dejó sin terminar hace más de maxAgeMs: se cierran como
  // perdidas con 0 puntos (así nadie corta sólo las que va perdiendo para cuidar la racha).
  async closeAbandoned(userId: string, game: GameId, maxAgeMs: number, now = Date.now()) {
    const open = await this.prisma.matches.findMany({
      where: { user_id: userId, game, status: 'in_progress', created_at: { lt: new Date(now - maxAgeMs) } },
      select: { id: true },
    });
    for (const m of open) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.matches.updateMany({
          where: { id: m.id, status: 'in_progress' },
          data: { status: 'abandoned', finished_at: new Date() },
        });
        if (claimed.count === 0) return;
        await this.stats.recordMatchResult(userId, { won: false, points: 0, game }, tx);
        await this.stats.logResult(tx, m.id, { userId, game, points: 0, won: false, abandoned: true });
      });
    }
    return open.length;
  }
}
