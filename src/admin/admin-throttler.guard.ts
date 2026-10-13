import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Límite de pedidos del panel: 30 por minuto por IP para TODO /admin junto (el ThrottlerGuard
// común cuenta cada endpoint por separado). Usa el ThrottlerModule (global) que registra AuthModule.
@Injectable()
export class AdminThrottlerGuard extends ThrottlerGuard {
  protected generateKey(_context: ExecutionContext, tracker: string, name: string): string {
    return `admin-${name}-${tracker}`;
  }

  protected async getErrorMessage(): Promise<string> {
    return 'Demasiados pedidos al panel. Esperá un minuto y probá de nuevo.';
  }
}
