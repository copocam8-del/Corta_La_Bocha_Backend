import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilitamos CORS para que el frontend (puerto 5173) pueda comunicarse con el backend sin bloqueos
  app.enableCors();

  await app.listen(3000);
  console.log('🚀 Backend de Corta La Bocha corriendo en: http://localhost:3000');
}
bootstrap();