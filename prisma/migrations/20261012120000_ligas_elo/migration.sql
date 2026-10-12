-- Ligas semanales/mensuales y ELO. Requiere aplicar antes 20261008140000_login_google.
-- Agrega dos columnas con valor por defecto a profiles (no cambia datos existentes: todos arrancan
-- con ELO 1000) y crea la tabla match_results (vacía: las ligas empiezan a contar desde que se aplica).

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "elo" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN "elo_games" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "game" VARCHAR(30) NOT NULL DEFAULT 'tutti_frutti',
    "mode" VARCHAR(20) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "elo_before" INTEGER NOT NULL,
    "elo_after" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_results_created_at_idx" ON "match_results"("created_at");

-- CreateIndex
CREATE INDEX "match_results_user_id_created_at_idx" ON "match_results"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_match_id_user_id_key" ON "match_results"("match_id", "user_id");

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
