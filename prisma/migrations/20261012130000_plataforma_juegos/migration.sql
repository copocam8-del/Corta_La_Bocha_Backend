-- Base para varios juegos. Requiere aplicar antes 20261012120000_ligas_elo.
-- - matches: columna "game" (todas las partidas existentes quedan como tutti_frutti) y "state"
--   (estado secreto de cada juego, vacío en las existentes).
-- - game_stats: estadísticas por juego. Se cargan con los totales actuales de cada perfil como
--   Tutti Frutti, que hasta ahora era el único juego.

-- AlterTable
ALTER TABLE "matches" ADD COLUMN "game" VARCHAR(30) NOT NULL DEFAULT 'tutti_frutti',
ADD COLUMN "state" JSONB;

-- CreateTable
CREATE TABLE "game_stats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game" VARCHAR(30) NOT NULL,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "matches_won" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "best_score" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_user_id_game_status_idx" ON "matches"("user_id", "game", "status");

-- CreateIndex
CREATE INDEX "game_stats_game_total_points_idx" ON "game_stats"("game", "total_points");

-- CreateIndex
CREATE UNIQUE INDEX "game_stats_user_id_game_key" ON "game_stats"("user_id", "game");

-- AddForeignKey
ALTER TABLE "game_stats" ADD CONSTRAINT "game_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos: lo jugado hasta ahora fue todo Tutti Frutti
INSERT INTO "game_stats" ("id", "user_id", "game", "matches_played", "matches_won", "total_points", "current_streak", "best_streak")
SELECT gen_random_uuid(), "user_id", 'tutti_frutti', "matches_played", "matches_won", "total_points", "current_streak", "best_streak"
FROM "profiles"
WHERE "matches_played" > 0;
