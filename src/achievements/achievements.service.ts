import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACHIEVEMENTS, AchievementContext } from './achievements.definitions';

export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
}

@Injectable()
export class AchievementsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Revisa qué logros cumple el usuario con la partida que acaba de terminar y guarda los
   * nuevos. Devuelve sólo los que se desbloquearon ahora (para mostrarlos en pantalla).
   * Se llama dentro de la misma transacción que actualiza las estadísticas.
   */
  async unlockFor(
    userId: string,
    ctx: AchievementContext,
    tx: Prisma.TransactionClient,
  ): Promise<UnlockedAchievement[]> {
    const earned = ACHIEVEMENTS.filter((a) => a.isUnlocked(ctx));
    if (earned.length === 0) return [];

    const already = await tx.user_achievements.findMany({
      where: { user_id: userId, achievement_id: { in: earned.map((a) => a.id) } },
      select: { achievement_id: true },
    });
    const alreadyIds = new Set(already.map((a) => a.achievement_id));
    const fresh = earned.filter((a) => !alreadyIds.has(a.id));
    if (fresh.length === 0) return [];

    await tx.user_achievements.createMany({
      data: fresh.map((a) => ({ user_id: userId, achievement_id: a.id })),
      skipDuplicates: true, // por si dos partidas terminan a la vez
    });

    return fresh.map(({ id, name, description }) => ({ id, name, description }));
  }

  // Todos los logros, con los del usuario marcados como desbloqueados (para el perfil)
  async listForUser(userId: string) {
    const unlocked = await this.prisma.user_achievements.findMany({
      where: { user_id: userId },
      select: { achievement_id: true, unlocked_at: true },
    });
    const unlockedAt = new Map(unlocked.map((u) => [u.achievement_id, u.unlocked_at]));

    return ACHIEVEMENTS.map(({ id, name, description }) => ({
      id,
      name,
      description,
      unlocked: unlockedAt.has(id),
      unlockedAt: unlockedAt.get(id) ?? null,
    }));
  }
}
