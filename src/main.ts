import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render pone un proxy adelante: sin esto todos los pedidos parecen venir de la misma IP
  // y el límite de intentos de /auth bloquearía a todos juntos
  app.set('trust proxy', 1);

  // CORS_ORIGIN es opcional: lista separada por comas (ej: "https://mi-front.com,http://localhost:5173").
  // Si no está definida se acepta cualquier origen, como antes.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors(corsOrigin?.length ? { origin: corsOrigin } : undefined);

  // Render asigna el puerto en la variable PORT
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`🚀 Backend de Corta La Bocha corriendo en el puerto ${port}`);
}
void bootstrap();
