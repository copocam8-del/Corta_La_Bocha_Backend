import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminThrottlerGuard } from './admin-throttler.guard';
import { RoomsModule } from '../rooms/rooms.module';
import { TuttiFruttiModule } from '../tutti-frutti/tutti-frutti.module';

@Module({
  imports: [
    RoomsModule, // salas y jugadores conectados ahora (motor en memoria)
    TuttiFruttiModule, // proveedor de IA configurado (nunca la clave)
    // El límite de pedidos usa el ThrottlerModule global que registra AuthModule (en memoria)
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminThrottlerGuard],
})
export class AdminModule {}
