import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService, AuthResult, TokenPair } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleMobileDto, AppleMobileDto } from './dto/oauth-mobile.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Registro ─────────────────────────────────────
  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Crear nueva cuenta' })
  @ApiResponse({ status: 201, description: 'Cuenta creada exitosamente' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  // ─── Login ────────────────────────────────────────
  @Public()
  @Post('login')
  @UseGuards(AuthGuard('local'))
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  login(@Req() req: any, @Body() _: LoginDto): Promise<AuthResult> {
    return this.authService.login(req.user);
  }

  // ─── Refresh Token ────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ─── Logout ───────────────────────────────────────
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  logout(@CurrentUser('id') userId: string, @Body() dto: RefreshTokenDto) {
    return this.authService.logout(userId, dto.refreshToken);
  }

  // ─── getMe ────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener usuario autenticado' })
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  // ─── Verificar email ──────────────────────────────
  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verificar email con token' })
  async verifyEmail(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    await this.authService.verifyEmail(token);
    // Redirigir a la app
    return res.redirect('macrovision://verified');
  }

  // ─── Forgot Password ──────────────────────────────
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  // ─── Reset Password ───────────────────────────────
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // ─── Google OAuth (Web) ───────────────────────────
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Iniciar autenticación con Google (web)' })
  googleAuth() {
    // Passport redirige automáticamente
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.handleGoogleAuth(req.user);
    const { accessToken, refreshToken } = result.tokens;
    // Deep link de vuelta a la app
    return res.redirect(
      `macrovision://auth?accessToken=${accessToken}&refreshToken=${refreshToken}`,
    );
  }

  // ─── Google OAuth (Mobile) ────────────────────────
  @Public()
  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticación con Google desde móvil' })
  async googleMobile(@Body() dto: GoogleMobileDto): Promise<AuthResult> {
    // Verificar idToken con Google
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: dto.idToken });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      throw new Error('Token de Google inválido');
    }

    return this.authService.handleGoogleAuth({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || '',
      avatarUrl: payload.picture,
    });
  }

  // ─── Apple OAuth (Mobile) ─────────────────────────
  @Public()
  @Post('apple/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticación con Apple desde móvil' })
  async appleMobile(@Body() dto: AppleMobileDto): Promise<AuthResult> {
    const { jwtDecode } = await import('jwt-decode');
    const decoded: any = jwtDecode(dto.identityToken);

    return this.authService.handleAppleAuth(
      decoded.sub,
      decoded.email || null,
      dto.fullName,
    );
  }
}
