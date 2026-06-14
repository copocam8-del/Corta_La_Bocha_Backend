import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true },
    })
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    })
  }

  update(id: number, name: string) {
    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, email: true },
    })
  }

  delete(id: number) {
    return this.prisma.user.delete({
      where: { id },
    })
  }
} 