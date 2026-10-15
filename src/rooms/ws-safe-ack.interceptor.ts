import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { catchError, Observable, of } from 'rxjs';

export const WS_ERROR = 'No se pudo procesar el pedido. Probá de nuevo.';

// Red de seguridad del gateway: si un handler tira una excepción que no esperábamos, el cliente igual recibe
// { ok: false } (sin esto se quedaba esperando una respuesta que nunca llegaba). El detalle va sólo al log.
@Injectable()
export class WsSafeAckInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Socket.IO');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((e: unknown) => {
        const evento = context.switchToWs().getPattern?.() ?? context.getHandler().name;
        this.logger.error(`Error en "${evento}": ${(e as Error)?.message ?? String(e)}`);
        return of({ ok: false, error: WS_ERROR });
      }),
    );
  }
}
