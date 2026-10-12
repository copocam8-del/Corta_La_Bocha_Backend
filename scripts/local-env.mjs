// Lee .env.local (variables para programar en tu compu) y controla que la base sea LOCAL.
// Lo usan db-local.mjs y dev-local.mjs. Nunca imprime contraseñas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/corta_la_bocha';

export function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  const vars = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } else {
    console.log('No encontré .env.local: uso los valores por defecto (copiá .env.local.example a .env.local para cambiarlos).');
  }
  vars.DATABASE_URL ??= DEFAULT_DATABASE_URL;
  return vars;
}

// Corta todo si la base no es local: así nunca se toca la de producción por error
export function assertLocalDatabase(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL de .env.local no es una URL válida.');
  }
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`DATABASE_URL de .env.local apunta a "${url.hostname}", no a tu compu. Por seguridad no sigo (nunca uses la base de producción para programar).`);
  }
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || 'postgres'),
    database: url.pathname.replace(/^\//, '') || 'corta_la_bocha',
  };
}

// URL sin la contraseña, para mostrar en pantalla
export const safeUrl = (u) => u.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:****@');
