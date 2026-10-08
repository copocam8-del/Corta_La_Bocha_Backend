import { Controller, Post, Get, Body, UseGuards, Request, UsePipes } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { authValidationPipe } from './auth-validation.pipe';

@Controller('auth')
@UsePipes(authValidationPipe)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req) {
    return req.user;
  }
}
