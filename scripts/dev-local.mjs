// npm run dev:local → servidor con recarga usando .env.local (base LOCAL, IA de prueba por defecto).
// Las variables de .env.local pisan a las del .env (que puede apuntar a producción).
import { spawn } from 'node:child_process';
import { assertLocalDatabase, loadEnvLocal, ROOT, safeUrl } from './local-env.mjs';

const env = loadEnvLocal();
try {
  assertLocalDatabase(env.DATABASE_URL);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
// Valores por defecto seguros para programar
env.NODE_ENV ??= 'development';
env.AI_PROVIDER ??= 'fake';
env.JWT_SECRET ??= 'secreto-solo-para-programar';
console.log(`Servidor local con la base ${safeUrl(env.DATABASE_URL)} · IA: ${env.AI_PROVIDER}`);
const child = spawn('npx', ['nest', 'start', '--watch'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
child.on('exit', (code) => process.exit(code ?? 0));
