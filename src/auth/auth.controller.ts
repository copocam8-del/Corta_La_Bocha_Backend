import { Controller, Post, Get, Body, UseGuards, Request, UsePipes, HttpCode } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
    private readonly passwordReset: PasswordResetService,
  ) {}

  // Máximo 5 registros por minuto por IP
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(ThrottlerGuard)
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  // Máximo 10 intentos de login por minuto por IP (frena a quien prueba contraseñas)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  // Login (o registro) con Google. Responde igual que /auth/login.
  // Si GOOGLE_CLIENT_ID no está configurado responde 503 y el resto sigue funcionando.
  // Máximo 10 intentos por minuto por IP, igual que el login con contraseña
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  @Post('google')
  google(@Body() body: GoogleLoginDto) {
    return this.googleAuthService.login(body.credential);
  }

  // "¿Olvidaste tu contraseña?". Responde siempre lo mismo, exista o no la cuenta.
  // Máximo 3 pedidos por minuto por IP (cada uno puede mandar un mail)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.passwordReset.forgot(body.email);
  }

  // Elegir la contraseña nueva con el token del mail. Máximo 5 intentos por minuto por IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.passwordReset.reset(body.token, body.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req) {
    return req.user;
  }
}
