-- Salas multijugador de cualquier juego: cada sala guarda de qué juego es.
-- Las salas que ya existen son de Tutti Frutti (el único juego con multijugador hasta ahora).
ALTER TABLE "rooms" ADD COLUMN "game" VARCHAR(30) NOT NULL DEFAULT 'tutti_frutti';
