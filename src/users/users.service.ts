import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.users.findMany({
      select: { id: true, username: true, email: true },
    })
  }

  findOne(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    })
  }

  update(id: string, username: string) {
    return this.prisma.users.update({
      where: { id },
      data: { username },
      select: { id: true, username: true, email: true },
    })
  }

  delete(id: string) {
    return this.prisma.users.delete({
      where: { id },
    })
  }
} 