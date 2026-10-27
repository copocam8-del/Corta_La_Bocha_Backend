-- Aceptación de los Términos y la Política de privacidad. Requiere aplicar antes 20261014120000_rls_todas_las_tablas.
-- Sólo agrega dos columnas a users (las dos pueden quedar vacías): los usuarios que ya existen quedan con
-- terms_version = NULL, así que la app les pide aceptar la versión vigente la próxima vez que entran.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(6),
ADD COLUMN "terms_version" VARCHAR(20);
