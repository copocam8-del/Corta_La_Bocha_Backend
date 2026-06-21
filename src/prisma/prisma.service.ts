import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    console.log('DATABASE_URL:', process.env.DATABASE_URL)
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    })
  }

  async onModuleInit() {
    try {
      await this.$connect()
    } catch (e) {
      console.warn('Prisma connection failed, continuing anyway:', e.message)
    }
  }
}