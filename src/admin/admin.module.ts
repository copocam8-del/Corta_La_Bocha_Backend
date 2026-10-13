import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { RoomsModule } from '../rooms/rooms.module';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';

@Module({
  imports: [
    RoomsModule, // salas y jugadores conectados ahora (motor en memoria)
    TuttiFruttiModule, // proveedor de IA configurado (nunca la clave)
    // Límite de pedidos del panel (30 por minuto, ver @Throttle en el controller). En memoria.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 30 }],
      errorMessage: 'Demasiados pedidos. Esperá un minuto y probá de nuevo.',
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
