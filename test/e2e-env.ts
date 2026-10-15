// Se carga ANTES de cada test e2e (setupFiles en jest-e2e.json). Los e2e levantan la app completa, y
// ConfigModule carga el .env, que apunta a PRODUCCIÓN. ConfigModule no pisa variables que ya existen
// (aunque estén vacías), así que acá se fijan todas las que importan:
//   - DATABASE_URL: la de la variable E2E_DATABASE_URL, o la de .env.local, o la local por defecto.
//     Si no es localhost, se corta todo: los e2e nunca tocan la base de producción.
//   - IA en modo fake, sin mails, sin login con Google y sin captcha: nada sale a internet.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_URL = 'postgresql://postgres:postgres@localhost:5433/corta_la_bocha';

function fromEnvLocal(): string | undefined {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

const url = process.env.E2E_DATABASE_URL || fromEnvLocal() || DEFAULT_URL;
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1'].includes(host)) {
  throw new Error(`Los tests e2e sólo corren contra una base LOCAL (DATABASE_URL apunta a "${host}").`);
}

Object.assign(process.env, {
  DATABASE_URL: url,
  NODE_ENV: 'test',
  JWT_SECRET: 'secreto-de-los-tests-e2e',
  JWT_EXPIRATION: '1h',
  CORS_ORIGIN: '',
  AI_PROVIDER: 'fake',
  AI_FAKE_DELAY_MS: '0',
  GEMINI_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  MAIL_PROVIDER: '',
  SMTP_HOST: '',
  BREVO_API_KEY: '',
  RESEND_API_KEY: '',
  GOOGLE_CLIENT_ID: '',
  TURNSTILE_SECRET_KEY: '',
  ADMIN_EMAILS: process.env.E2E_ADMIN_EMAILS ?? '',
  FRONTEND_URL: 'http://localhost:5173',
});
