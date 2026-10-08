-- Login con Google: guarda el id de la cuenta de Google de cada usuario (opcional y único).
-- Sólo agrega una columna: no modifica datos existentes.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

