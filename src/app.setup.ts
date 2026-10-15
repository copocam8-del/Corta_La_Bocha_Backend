import { NestExpressApplication } from '@nestjs/platform-express';
import { securityHeaders } from './security/security-headers';

// Configuración HTTP de la app. La usan main.ts y los tests (así se prueba lo mismo que corre en Render).
export function configureApp(app: NestExpressApplication, corsOriginEnv = process.env.CORS_ORIGIN) {
  // Render pone un proxy adelante: sin esto todos los pedidos parecen venir de la misma IP
  // y el límite de intentos de /auth bloquearía a todos juntos
  app.set('trust proxy', 1);

  // Cabeceras de seguridad (HSTS, nosniff, X-Frame-Options, Referrer-Policy): ver security-headers.ts
  app.use(securityHeaders());

  // CORS_ORIGIN es opcional: lista separada por comas (ej: "https://mi-front.com,http://localhost:5173").
  // Si no está definida se acepta cualquier origen, como antes.
  const corsOrigin = corsOriginEnv?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors(corsOrigin?.length ? { origin: corsOrigin } : undefined);
}
