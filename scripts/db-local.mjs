// npm run db:local → levanta una PostgreSQL en tu compu, aplica las migraciones y carga el seed.
//   - Si Docker está andando, usa Docker (docker-compose.local.yml; queda corriendo de fondo).
//   - Si no, usa embedded-postgres (se instala solo en .local-db/tools la primera vez; la base queda
//     corriendo mientras esta ventana esté abierta).
// Opciones: --verificar (levanta, migra, carga el seed y apaga: sirve para probar que todo anda)
// La base es SIEMPRE local: si DATABASE_URL de .env.local no apunta a localhost, no hace nada.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertLocalDatabase, loadEnvLocal, ROOT, safeUrl } from './local-env.mjs';

const EMBEDDED_VERSION = '17.10.0-beta.17';
const verificar = process.argv.includes('--verificar');
const DATA_ROOT = process.env.LOCAL_DB_DIR ? path.resolve(process.env.LOCAL_DB_DIR) : path.join(ROOT, '.local-db');

const env = loadEnvLocal();
const db = assertLocalDatabase(env.DATABASE_URL);
console.log(`Base local: ${safeUrl(env.DATABASE_URL)}`);

const run = (cmd, args, extraEnv = {}) =>
  spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, ...extraEnv } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function conDocker() {
  console.log('Docker está andando: levanto la base con docker compose…');
  const composeEnv = { CLB_DB_PORT: String(db.port), CLB_DB_USER: db.user, CLB_DB_PASSWORD: db.password, CLB_DB_NAME: db.database };
  if (run('docker', ['compose', '-f', 'docker-compose.local.yml', 'up', '-d'], composeEnv).status !== 0) throw new Error('docker compose falló');
  for (let i = 0; i < 60; i++) {
    const ok = spawnSync('docker', ['compose', '-f', 'docker-compose.local.yml', 'exec', '-T', 'db', 'pg_isready', '-U', db.user], {
      cwd: ROOT, stdio: 'ignore', shell: true, env: { ...process.env, ...composeEnv },
    });
    if (ok.status === 0) return { stop: async () => run('docker', ['compose', '-f', 'docker-compose.local.yml', 'stop'], composeEnv) };
    await sleep(1000);
  }
  throw new Error('La base de Docker no respondió a tiempo.');
}

async function conEmbedded() {
  console.log('Docker no está andando: uso embedded-postgres (no hace falta instalar nada).');
  const tools = path.join(DATA_ROOT, 'tools');
  const require = createRequire(path.join(tools, 'package.json'));
  try {
    require.resolve('embedded-postgres');
  } catch {
    console.log('Instalando embedded-postgres la primera vez (puede tardar un par de minutos)…');
    fs.mkdirSync(tools, { recursive: true });
    if (!fs.existsSync(path.join(tools, 'package.json'))) fs.writeFileSync(path.join(tools, 'package.json'), '{"private":true}');
    if (run('npm', ['install', '--no-audit', '--no-fund', '--prefix', `"${tools}"`, `embedded-postgres@${EMBEDDED_VERSION}`]).status !== 0) {
      throw new Error('No se pudo instalar embedded-postgres.');
    }
  }
  const mod = await import(new URL(`file:///${require.resolve('embedded-postgres').replace(/\\/g, '/')}`).href);
  const EmbeddedPostgres = mod.default ?? mod;
  const dataDir = path.join(DATA_ROOT, 'data');
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: db.user, password: db.password, port: db.port, persistent: true });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(db.database);
  } catch {
    /* ya existía */
  }
  return { stop: () => pg.stop() };
}

const docker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true }).status === 0;
let base;
try {
  base = docker ? await conDocker() : await conEmbedded();
  const dbEnv = { DATABASE_URL: env.DATABASE_URL };
  console.log('\nAplicando migraciones…');
  if (run('npx', ['prisma', 'migrate', 'deploy'], dbEnv).status !== 0) throw new Error('Fallaron las migraciones.');
  console.log('\nCargando el seed (categorías)…');
  if (run('npx', ['prisma', 'db', 'seed'], dbEnv).status !== 0) throw new Error('Falló el seed.');
  console.log('\n✅ Base local lista.');
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  await base?.stop();
  process.exit(1);
}

if (verificar) {
  await base.stop();
  console.log('Verificación terminada: la base se apagó.');
  process.exit(0);
}
if (docker) {
  console.log('La base queda corriendo en Docker. Para apagarla: docker compose -f docker-compose.local.yml stop');
} else {
  console.log('La base está corriendo. Dejá esta ventana abierta y en OTRA terminal corré: npm run dev:local');
  console.log('Para apagarla: Ctrl+C.');
  const apagar = async () => {
    await base.stop();
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
  setInterval(() => undefined, 1 << 30); // mantener vivo el proceso
}
