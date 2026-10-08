import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface MatchResult {
  won: boolean;
  // Puntos a sumar al total. En multijugador los puntos ya se suman ronda por ronda al contar
  // los votos, así que al terminar la partida se pasa 0.
  points: number;
}

// Estadísticas del perfil (partidas jugadas/ganadas, puntos, rachas) y ranking global.
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

  // Posición en el ranking global (por puntos totales). Empatados comparten posición.
  async getUserRanking(userId: string) {
    const profile = await this.prisma.profiles.findUnique({
      where: { user_id: userId },
      select: { total_points: true },
    });
    const points = profile?.total_points ?? 0;

    const [ahead, totalPlayers] = await Promise.all([
      this.prisma.profiles.count({ where: { total_points: { gt: points } } }),
      this.prisma.profiles.count(),
    ]);

    return { position: ahead + 1, totalPlayers: Math.max(totalPlayers, 1), totalPoints: points };
  }

  // Los mejores N jugadores. Sólo datos públicos.
  async getTopPlayers(limit = 50) {
    const profiles = await this.prisma.profiles.findMany({
      orderBy: [{ total_points: 'desc' }, { matches_won: 'desc' }],
      take: limit,
      select: {
        total_points: true,
        matches_played: true,
        matches_won: true,
        best_streak: true,
        avatar_id: true,
        user: { select: { id: true, username: true, country: true } },
      },
    });

    // Posición con empates: mismo puntaje → misma posición
    let lastPoints: number | null = null;
    let lastPosition = 0;
    return profiles.map((p, i) => {
      if (p.total_points !== lastPoints) {
        lastPosition = i + 1;
        lastPoints = p.total_points;
      }
      return {
        position: lastPosition,
        userId: p.user.id,
        username: p.user.username,
        country: p.user.country,
        avatarId: p.avatar_id,
        totalPoints: p.total_points,
        matchesPlayed: p.matches_played,
        matchesWon: p.matches_won,
        bestStreak: p.best_streak,
      };
    });
  }
}
