import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eloMultiplayer, eloVsMachine } from './elo';
import { periodStart, type Period } from './periods';

export interface MatchResult {
  won: boolean;
  // Puntos a sumar al total del perfil
  points: number;
}

// Resultado de un jugador en una partida, para el ELO y las ligas
export interface RatedResult {
  userId: string;
  points: number;
  won: boolean;
  abandoned: boolean;
}

// Estadísticas del perfil (partidas jugadas/ganadas, puntos, rachas), ELO, ligas y ranking.
// Es el único lugar que debería modificar esos contadores.
@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async recordMatchResult(userId: string, result: MatchResult, tx?: Prisma.TransactionClient) {
    const run = async (db: Prisma.TransactionClient) => {
      const profile = await db.profiles.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId },
      });

      // Racha = victorias seguidas. Una derrota o un empate la corta.
      const currentStreak = result.won ? profile.current_streak + 1 : 0;

      return db.profiles.update({
        where: { user_id: userId },
        data: {
          matches_played: { increment: 1 },
          matches_won: { increment: result.won ? 1 : 0 },
          total_points: { increment: Math.max(0, result.points) },
          current_streak: currentStreak,
          best_streak: Math.max(profile.best_streak, currentStreak),
        },
      });
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  // ELO + registro para las ligas de una partida contra la máquina (dentro de la misma transacción
  // que recordMatchResult). Las partidas "sin validar" no llegan acá.
  async rateVsMachine(
    tx: Prisma.TransactionClient,
    matchId: string,
    r: RatedResult & { outcome: 'win' | 'draw' | 'loss'; difficulty: string },
    game = 'tutti_frutti',
  ) {
    const profile = await tx.profiles.upsert({ where: { user_id: r.userId }, update: {}, create: { user_id: r.userId } });
    const after = eloVsMachine(profile.elo, r.difficulty, r.outcome);
    await this.saveRated(tx, matchId, 'vs_ai', game, [{ ...r, before: profile.elo, after }]);
    return after;
  }

  // ELO + registro para las ligas de una partida multijugador (todos juntos)
  async rateMultiplayer(tx: Prisma.TransactionClient, matchId: string, results: RatedResult[], game = 'tutti_frutti') {
    const profiles = await Promise.all(
      results.map((r) => tx.profiles.upsert({ where: { user_id: r.userId }, update: {}, create: { user_id: r.userId } })),
    );
    const before = Object.fromEntries(profiles.map((p) => [p.user_id, p.elo]));
    const after = eloMultiplayer(results.map((r) => ({ ...r, elo: before[r.userId] })));
    await this.saveRated(
      tx,
      matchId,
      'multiplayer',
      game,
      results.map((r) => ({ ...r, before: before[r.userId], after: after[r.userId] })),
    );
    return after;
  }

  private async saveRated(
    tx: Prisma.TransactionClient,
    matchId: string,
    mode: string,
    game: string,
    rows: (RatedResult & { before: number; after: number })[],
  ) {
    for (const r of rows) {
      await tx.profiles.update({ where: { user_id: r.userId }, data: { elo: r.after, elo_games: { increment: 1 } } });
    }
    await tx.match_results.createMany({
      data: rows.map((r) => ({
        user_id: r.userId,
        match_id: matchId,
        game,
        mode,
        points: Math.max(0, r.points),
        won: r.won,
        abandoned: r.abandoned,
        elo_before: r.before,
        elo_after: r.after,
        created_at: new Date(), // hora del servidor (la columna no guarda zona horaria)
      })),
      skipDuplicates: true,
    });
  }

  // ── Ranking ───────────────────────────────────────────────────────────────────────────────

  // Tabla de posiciones: global (puntos totales), semanal/mensual (partidas del período) o ELO.
  // Empatados comparten posición. Sólo datos públicos.
  async getLeaderboard(period: Period = 'global', limit = 50) {
    const rows = await this.rows(period);
    return withPositions(rows).slice(0, limit);
  }

  // Posición del usuario aunque no esté en el top
  async getUserRanking(userId: string, period: Period = 'global') {
    const rows = withPositions(await this.rows(period));
    const mine = rows.find((r) => r.userId === userId);
    const profile = await this.prisma.profiles.findUnique({
      where: { user_id: userId },
      select: { total_points: true, elo: true, elo_games: true },
    });
    const start = periodStart(period);
    return {
      period,
      from: start?.toISOString() ?? null,
      position: mine?.position ?? null,
      totalPlayers: Math.max(rows.length, 1),
      // En global se mantiene igual que antes: puntos totales del perfil
      totalPoints: period === 'global' ? (profile?.total_points ?? 0) : (mine?.totalPoints ?? 0),
      matchesPlayed: mine?.matchesPlayed ?? 0,
      matchesWon: mine?.matchesWon ?? 0,
      elo: profile?.elo ?? 1000,
      eloGames: profile?.elo_games ?? 0,
    };
  }

  // Compatibilidad: top global
  getTopPlayers(limit = 50) {
    return this.getLeaderboard('global', limit);
  }

  private async rows(period: Period): Promise<LeaderRow[]> {
    const userSelect = { id: true, username: true, country: true } as const;

    if (period === 'global' || period === 'elo') {
      const profiles = await this.prisma.profiles.findMany({
        where: period === 'elo' ? { elo_games: { gt: 0 } } : {},
        orderBy: period === 'elo' ? [{ elo: 'desc' }, { matches_won: 'desc' }] : [{ total_points: 'desc' }, { matches_won: 'desc' }],
        select: {
          total_points: true, matches_played: true, matches_won: true, best_streak: true, avatar_id: true, elo: true,
          user: { select: userSelect },
        },
      });
      return profiles.map((p) => ({
        userId: p.user.id,
        username: p.user.username,
        country: p.user.country,
        avatarId: p.avatar_id,
        totalPoints: p.total_points,
        matchesPlayed: p.matches_played,
        matchesWon: p.matches_won,
        bestStreak: p.best_streak,
        elo: p.elo,
        score: period === 'elo' ? p.elo : p.total_points,
      }));
    }

    // Semanal / mensual: se suman las partidas del período
    const since = periodStart(period)!;
    const [totals, wins] = await Promise.all([
      this.prisma.match_results.groupBy({
        by: ['user_id'],
        where: { created_at: { gte: since } },
        _sum: { points: true },
        _count: { _all: true },
      }),
      this.prisma.match_results.groupBy({
        by: ['user_id'],
        where: { created_at: { gte: since }, won: true },
        _count: { _all: true },
      }),
    ]);
    const winsOf = new Map(wins.map((w) => [w.user_id, w._count._all]));
    const users = await this.prisma.users.findMany({
      where: { id: { in: totals.map((t) => t.user_id) } },
      select: { ...userSelect, profile: { select: { avatar_id: true, best_streak: true, elo: true } } },
    });
    const userOf = new Map(users.map((u) => [u.id, u]));
    return totals
      .map((t) => {
        const u = userOf.get(t.user_id);
        return {
          userId: t.user_id,
          username: u?.username ?? '—',
          country: u?.country ?? null,
          avatarId: u?.profile?.avatar_id ?? null,
          totalPoints: t._sum.points ?? 0,
          matchesPlayed: t._count._all,
          matchesWon: winsOf.get(t.user_id) ?? 0,
          bestStreak: u?.profile?.best_streak ?? 0,
          elo: u?.profile?.elo ?? 1000,
          score: t._sum.points ?? 0,
        };
      })
      .sort((a, b) => b.score - a.score || b.matchesWon - a.matchesWon);
  }
}

interface LeaderRow {
  userId: string;
  username: string;
  country: string | null;
  avatarId: string | null;
  totalPoints: number;
  matchesPlayed: number;
  matchesWon: number;
  bestStreak: number;
  elo: number;
  score: number; // por lo que se ordena (puntos o ELO)
}

// Mismo puntaje → misma posición
function withPositions(rows: LeaderRow[]) {
  let last: number | null = null;
  let position = 0;
  return rows.map(({ score, ...r }, i) => {
    if (score !== last) {
      position = i + 1;
      last = score;
    }
    return { position, ...r };
  });
}
