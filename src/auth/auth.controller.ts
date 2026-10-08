import { Controller, Post, Get, Body, UseGuards, Request, UsePipes } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleAuthService } from './google-auth.service';
import { authValidationPipe } from './auth-validation.pipe';

@Controller('auth')
@UsePipes(authValidationPipe)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  // Login (o registro) con Google. Responde igual que /auth/login.
  // Si GOOGLE_CLIENT_ID no está configurado responde 503 y el resto sigue funcionando.
  @Post('google')
  google(@Body() body: GoogleLoginDto) {
    return this.googleAuthService.login(body.credential);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req) {
    return req.user;
  }
}
