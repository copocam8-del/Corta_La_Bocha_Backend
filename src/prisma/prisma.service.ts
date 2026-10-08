import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

// Una sola instancia para toda la app: se registra en PrismaModule (global).
// No crear PrismaService en los "providers" de otros módulos: cada copia abre su propio
// grupo de conexiones contra la base (Supabase free tiene un límite bajo).
// Prisma lee DATABASE_URL solo; nunca la imprimas en los logs: tiene la contraseña.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('Conectado a la base de datos')
    } catch (e) {
      // En producción preferimos que el deploy falle (Render mantiene la versión anterior)
      // antes que quedar "live" devolviendo 500 en cada pedido
      if (process.env.NODE_ENV === 'production') throw e
      this.logger.warn(`No se pudo conectar a la base, sigo igual (sólo fuera de producción): ${(e as Error).message}`)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
