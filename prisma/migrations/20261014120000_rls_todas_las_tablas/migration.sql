-- Activa Row Level Security (RLS) en TODAS las tablas de public, sin políticas.
--
-- ¿Para qué? Supabase publica el esquema public por su API REST (PostgREST) con los roles "anon" y
-- "authenticated". Sin RLS, cualquiera con la "anon key" del proyecto podría leer o escribir estas tablas
-- sin pasar por nuestro backend. Con RLS activado y SIN políticas, esos roles no ven ni tocan ninguna fila.
--
-- ¿Por qué la app sigue andando? Prisma se conecta con el usuario dueño de las tablas (el que corrió las
-- migraciones). En PostgreSQL el DUEÑO de una tabla no está sujeto a RLS (salvo FORCE ROW LEVEL SECURITY,
-- que acá NO usamos), igual que los superusuarios y los roles con BYPASSRLS. Probado con un usuario que no es
-- superusuario y es dueño de las tablas: test/seguridad.e2e-spec.ts (también en el CI).
--
-- Si agregás una tabla nueva, activale RLS en su migración (el test e2e falla si alguna queda sin RLS).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contenido_visto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "game_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "match_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_resets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room_players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
