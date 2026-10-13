import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { isPeriodoAdmin, type PeriodoAdmin } from './admin-calculos';

function periodo(p?: string): PeriodoAdmin {
  if (!p) return '7d';
  if (!isPeriodoAdmin(p)) throw new BadRequestException('Período inválido (hoy, 7d, 30d o todo)');
  return p;
}

// Panel de administración del equipo. SÓLO LECTURA (todos GET).
// Orden de los guards: límite de pedidos → sesión (401) → admin (404 si no lo es).
@Throttle({ default: { ttl: 60_000, limit: 30 } })
@UseGuards(ThrottlerGuard, AuthGuard('jwt'), AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('usuarios')
  usuarios(@Query('periodo') p?: string) {
    return this.admin.usuarios(periodo(p));
  }

  @Get('partidas')
  partidas(@Query('periodo') p?: string) {
    return this.admin.partidas(periodo(p));
  }

  @Get('ia')
  ia(@Query('periodo') p?: string) {
    return this.admin.ia(periodo(p));
  }

  @Get('contenido')
  contenido(@Query('periodo') p?: string) {
    return this.admin.contenido(periodo(p));
  }
}
