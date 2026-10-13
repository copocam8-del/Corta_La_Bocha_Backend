import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { AchievementsService, UnlockedAchievement } from '../achievements/achievements.service';
import type { FinalPlayerResult, MultiGameId, RoomStore, SavedAnswer, Settings, StoredPlayer, StoredRoom } from './game-engine';
import { isMultiGame } from './modes/types';

// Acceso a la base del multijugador (lo usa el motor: game-engine.ts). Acá no hay reglas de juego:
// sólo se guarda lo que decide el motor.
@Injectable()
export class RoomsService implements RoomStore {
  constructor(
    private prisma: PrismaService,
    private stats: StatsService,
    private achievements: AchievementsService,
  ) {}

  private generateRoomCode(): string {
    // Sin letras/números que se confunden (I/1, O/0)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  private readonly playerInclude = {
    user: { select: { id: true, username: true, profile: { select: { avatar_id: true } } } },
  } as const;

  private toStoredPlayer(rp: {
    id: string;
    user_id: string;
    joined_at: Date;
    user: { username: string; profile: { avatar_id: string | null } | null };
  }): StoredPlayer {
    return {
      userId: rp.user_id,
      username: rp.user.username,
      avatarId: rp.user.profile?.avatar_id ?? null,
      roomPlayerId: rp.id,
      joinedAt: rp.joined_at,
    };
  }

  async createRoom(isPrivate: boolean, userIds: string[], game: MultiGameId = 'tutti_frutti'): Promise<StoredRoom> {
    let code = this.generateRoomCode();
    while (await this.prisma.rooms.findUnique({ where: { room_code: code } })) code = this.generateRoomCode();

    const room = await this.prisma.rooms.create({
      data: {
        room_code: code,
        is_private: isPrivate,
        game,
        max_players: 8,
        status: 'waiting',
        // Uno por uno para que el orden de llegada (joined_at) quede igual que el de la lista
        room_players: { create: userIds.map((user_id, i) => ({ user_id, joined_at: new Date(Date.now() + i) })) },
      },
      include: { room_players: { include: this.playerInclude } },
    });
    return {
      roomId: room.id,
      code: room.room_code!,
      isPrivate: room.is_private,
      status: room.status,
      game,
      players: room.room_players.map((rp) => this.toStoredPlayer(rp)),
    };
  }

  async loadRoom(code: string): Promise<StoredRoom | null> {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: code.toUpperCase() },
      include: { room_players: { include: this.playerInclude } },
    });
    if (!room) return null;
    return {
      roomId: room.id,
      code: room.room_code!,
      isPrivate: room.is_private,
      status: room.status,
      game: isMultiGame(room.game) ? room.game : 'tutti_frutti',
      players: room.room_players.map((rp) => this.toStoredPlayer(rp)),
    };
  }

  async addPlayer(roomId: string, userId: string): Promise<StoredPlayer> {
    const rp = await this.prisma.room_players.upsert({
      where: { room_id_user_id: { room_id: roomId, user_id: userId } },
      update: {},
      create: { room_id: roomId, user_id: userId },
      include: this.playerInclude,
    });
    return this.toStoredPlayer(rp);
  }

  async removePlayer(roomId: string, userId: string) {
    // Si ya jugó partidas en esta sala, sus respuestas apuntan a room_players: no se borra
    const rp = await this.prisma.room_players.findUnique({
      where: { room_id_user_id: { room_id: roomId, user_id: userId } },
      include: { _count: { select: { answers: true } } },
    });
    if (rp && rp._count.answers === 0) await this.prisma.room_players.delete({ where: { id: rp.id } });
  }

  async setRoomStatus(roomId: string, status: 'waiting' | 'playing' | 'closed') {
    await this.prisma.rooms.update({ where: { id: roomId }, data: { status } });
  }

  async createMatch(roomId: string, settings: Settings, game: MultiGameId = 'tutti_frutti'): Promise<string> {
    const match = await this.prisma.matches.create({
      data: {
        room_id: roomId,
        mode: 'multiplayer',
        game,
        ai_difficulty: settings.dificultad ?? null, // en los juegos nuevos, la dificultad elegida
        tematica: settings.tematica.slice(0, 30),
        round_seconds: settings.seconds,
        status: 'in_progress',
      },
    });
    return match.id;
  }

  async createRound(matchId: string, roundNumber: number, letter: string): Promise<string> {
    const round = await this.prisma.rounds.create({
      data: { match_id: matchId, round_number: roundNumber, letter, status: 'answering', started_at: new Date() },
    });
    return round.id;
  }

  async saveRound(roundId: string, answers: SavedAnswer[]) {
    const categories = await this.prisma.categories.findMany({
      where: { name: { in: [...new Set(answers.map((a) => a.category))] } },
      select: { id: true, name: true },
    });
    const idOf = new Map(categories.map((c) => [c.name, c.id]));
    await this.prisma.$transaction([
      ...answers
        .filter((a) => idOf.has(a.category)) // categoría no sembrada: se puntúa igual, no se guarda
        .map((a) =>
          this.prisma.answers.create({
            data: {
              round_id: roundId,
              room_player_id: a.roomPlayerId,
              category_id: idOf.get(a.category)!,
              answer_text: a.answer,
              is_valid: a.status === 'unverified' ? null : a.status === 'valid',
              points: a.points,
              validated_by: a.status === 'unverified' ? 'unverified' : 'ai',
            },
          }),
        ),
      this.prisma.rounds.update({ where: { id: roundId }, data: { status: 'finished', finished_at: new Date() } }),
    ]);
  }

  /**
   * Termina una partida multijugador (de cualquier juego): estadísticas generales y del juego, ELO,
   * ligas y logros de todos (una sola vez). Si en Tutti Frutti la IA no pudo validar alguna
   * respuesta (countsForStats = false), la partida se cierra pero no cuenta, igual que en la partida
   * contra la máquina. Quien abandonó cuenta como partida perdida. Un empate en el primer puesto
   * NO es victoria (won = false: suma la partida, corta la racha y no da logros de ganar); en el
   * ELO, entre los que empataron cuenta 0,5. Cómo terminó queda en matches.state.resultado.
   */
  async finishMatch(
    matchId: string,
    roomId: string,
    results: FinalPlayerResult[],
    countsForStats: boolean,
    game: MultiGameId = 'tutti_frutti',
  ): Promise<Record<string, UnlockedAchievement[]>> {
    const newAchievements: Record<string, UnlockedAchievement[]> = {};
    await this.prisma.$transaction(async (tx) => {
      // Se termina una sola vez (evita sumar dos veces las estadísticas)
      const claimed = await tx.matches.updateMany({
        where: { id: matchId, status: 'in_progress' },
        data: { status: 'finished', finished_at: new Date(), state: { resultado: resumenResultado(results) } },
      });
      if (claimed.count === 0) return;
      await tx.rooms.update({ where: { id: roomId }, data: { status: 'waiting' } });
      if (!countsForStats) return;

      // ELO de todos con los ELO de antes de la partida + registro para las ligas. En multijugador
      // hay rivales, así que todos los juegos mueven el ELO.
      await this.stats.rateMultiplayer(tx, matchId, results.map(({ extra: _extra, ...r }) => r), game);
      for (const r of results) {
        const updated = await this.stats.recordMatchResult(r.userId, { won: r.won, points: r.points, game }, tx);
        const gs = updated.game_stats;
        newAchievements[r.userId] = await this.achievements.unlockFor(
          r.userId,
          {
            matchesPlayed: updated.matches_played,
            matchesWon: updated.matches_won,
            totalPoints: updated.total_points,
            currentStreak: updated.current_streak,
            game,
            mode: 'multiplayer',
            won: r.won,
            points: r.points,
            gameMatchesPlayed: gs?.matches_played,
            gameMatchesWon: gs?.matches_won,
            gameTotalPoints: gs?.total_points,
            gameCurrentStreak: gs?.current_streak,
            extra: r.extra,
          },
          tx,
        );
      }
    });
    return newAchievements;
  }

  // Para la pantalla "Unirse con código": si existe y en qué estado está (sin datos de los jugadores)
  async summary(code: string) {
    const room = await this.prisma.rooms.findUnique({
      where: { room_code: code.toUpperCase() },
      select: { room_code: true, is_private: true, status: true, max_players: true, _count: { select: { room_players: true } } },
    });
    if (!room || room.status === 'closed') throw new NotFoundException('Sala no encontrada');
    return {
      code: room.room_code,
      isPrivate: room.is_private,
      status: room.status,
      players: room._count.room_players,
      maxPlayers: room.max_players,
    };
  }
}

// Cómo terminó la partida (se guarda en matches.state; sin columnas nuevas): ganador, empate
// (con quiénes) o sin ganador (nadie sumó puntos)
export function resumenResultado(results: FinalPlayerResult[]) {
  const empatados = results.filter((r) => r.result === 'draw').map((r) => r.userId);
  const ganador = results.find((r) => r.won)?.userId ?? null;
  if (empatados.length) return { tipo: 'empate', empatados };
  return ganador ? { tipo: 'ganador', ganador } : { tipo: 'sin_ganador' };
}
