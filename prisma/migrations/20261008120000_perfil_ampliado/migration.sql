-- Perfil ampliado: avatar elegido de un set propio, racha actual, y datos de las partidas solo
-- (dueño, temática y duración de ronda). Sólo agrega columnas: no borra ni modifica datos existentes.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "avatar_id" VARCHAR(30),
ADD COLUMN     "current_streak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "round_seconds" INTEGER,
ADD COLUMN     "tematica" VARCHAR(30),
ADD COLUMN     "user_id" UUID;

-- CreateIndex
CREATE INDEX "matches_user_id_idx" ON "matches"("user_id");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

