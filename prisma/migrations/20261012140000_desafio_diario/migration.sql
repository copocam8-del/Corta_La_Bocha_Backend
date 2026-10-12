-- Desafío del día (trivia diaria). Requiere aplicar antes 20261012130000_plataforma_juegos.
-- Sólo crea una tabla nueva.

-- CreateTable
CREATE TABLE "daily_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "match_id" UUID NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "aciertos" INTEGER NOT NULL DEFAULT 0,
    "puntos" INTEGER NOT NULL DEFAULT 0,
    "ms_total" INTEGER NOT NULL DEFAULT 0,
    "resultado" VARCHAR(20) NOT NULL DEFAULT '',
    "racha" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_challenges_match_id_key" ON "daily_challenges"("match_id");

-- CreateIndex
CREATE INDEX "daily_challenges_day_completed_idx" ON "daily_challenges"("day", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "daily_challenges_user_id_day_key" ON "daily_challenges"("user_id", "day");

-- AddForeignKey
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
