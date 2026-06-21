import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common'

import { AuthGuard } from '@nestjs/passport'
import { UsersService } from './users.service'

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll()
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { username: string }) {
    return this.usersService.update(id, body.username)
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.usersService.delete(id)
  }
} 