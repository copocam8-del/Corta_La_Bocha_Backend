import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GameId } from './games';
import type { Vistos } from './vistos';

// Qué preguntas/palabras ya vio cada usuario en cada juego (tabla contenido_visto). Lo usan la
// trivia, el ahorcado y la sopa de letras (solos y en multijugador) para no repetir. El desafío del
// día NO lo usa: tiene que ser igual para todos.
//
// Para no hacer más lenta la partida: UNA consulta para leer (de todos los jugadores juntos) y UNA
// para guardar. Si la base falla, el juego sigue igual (sin priorizar): nunca corta una partida.
@Injectable()
export class ContenidoVistoService {
  private readonly logger = new Logger('ContenidoVisto');

  constructor(private readonly prisma: PrismaService) {}

  // Lo que vio alguno de estos usuarios en el juego, con la última vez que lo vio cualquiera de ellos
  async leer(userIds: string[], game: GameId): Promise<Vistos> {
    if (!userIds.length) return new Map();
    try {
      const filas = await this.prisma.contenido_visto.groupBy({
        by: ['item_id'],
        where: { user_id: { in: userIds }, game },
        _max: { seen_at: true },
      });
      return new Map(filas.map((f) => [f.item_id, f._max.seen_at?.getTime() ?? 0]));
    } catch (e) {
      this.logger.warn(`No se pudo leer lo visto (${game}): ${(e as Error).message}`);
      return new Map();
    }
  }

  // Marca como vistos estos ítems para todos estos usuarios (si ya estaban, actualiza la fecha).
  // La fecha va en UTC como texto: la columna no tiene zona horaria (igual que el resto de las fechas).
  async marcar(userIds: string[], game: GameId, items: string[], now = new Date()): Promise<void> {
    const unicos = [...new Set(items)];
    if (!userIds.length || !unicos.length) return;
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "contenido_visto" ("user_id", "game", "item_id", "seen_at")
        SELECT u, ${game}, i, ${now.toISOString()}::timestamp
        FROM unnest(${userIds}::uuid[]) AS u CROSS JOIN unnest(${unicos}::text[]) AS i
        ON CONFLICT ("user_id", "game", "item_id") DO UPDATE SET "seen_at" = EXCLUDED."seen_at"`);
    } catch (e) {
      this.logger.warn(`No se pudo guardar lo visto (${game}): ${(e as Error).message}`);
    }
  }
}
