-- Que no se repitan preguntas ni palabras: qué vio cada usuario en cada juego.
-- Sólo agrega una tabla (no toca las demás).
CREATE TABLE "contenido_visto" (
    "user_id" UUID NOT NULL,
    "game" VARCHAR(30) NOT NULL,
    "item_id" VARCHAR(80) NOT NULL,
    "seen_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "contenido_visto_pkey" PRIMARY KEY ("user_id","game","item_id")
);

ALTER TABLE "contenido_visto" ADD CONSTRAINT "contenido_visto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
