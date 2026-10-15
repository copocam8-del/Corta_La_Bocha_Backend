import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // trust proxy, cabeceras de seguridad y CORS (ver app.setup.ts; los tests usan la misma función)
  configureApp(app);

  // Render asigna el puerto en la variable PORT
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`🚀 Backend de Corta La Bocha corriendo en el puerto ${port}`);
}
void bootstrap();
