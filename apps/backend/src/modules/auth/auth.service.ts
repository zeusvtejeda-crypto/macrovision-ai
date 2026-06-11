import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { PrismaService } from '@database/prisma.service';
import { EmailService } from '@common/services/email.service';
import { RegisterDto } from './dto/register.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: string;
    subscriptionStatus: string;
    onboardingCompleted: boolean;
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Validación para LocalStrategy ────────────────
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.passwordHash) return null;
    if (!user.isActive) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    return user;
  }

  // ─── Registro ─────────────────────────────────────
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const verificationToken = nanoid(32);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        verificationToken,
        profile: { create: {} }, // Perfil vacío — se completa en onboarding
      },
    });

    // Enviar email de verificación (no bloquear si falla)
    this.emailService
      .sendVerificationEmail(user.email, user.name || 'Usuario', verificationToken)
      .catch((err) => this.logger.error('Error enviando email verificación', err));

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.subscriptionStatus);

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  }

  // ─── Login ────────────────────────────────────────
  async login(user: any): Promise<AuthResult> {
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.subscriptionStatus,
    );

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  }

  // ─── Refresh Token ────────────────────────────────
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Rotación de refresh token — invalidar el viejo
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const { user } = storedToken;
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.subscriptionStatus,
    );
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ─── Logout ───────────────────────────────────────
  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }

  // ─── OAuth Google ─────────────────────────────────
  async handleGoogleAuth(googleUser: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }): Promise<AuthResult> {
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.googleId },
          { email: googleUser.email.toLowerCase() },
        ],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email.toLowerCase(),
          googleId: googleUser.googleId,
          name: googleUser.name,
          avatarUrl: googleUser.avatarUrl,
          emailVerified: true, // Google ya verificó el email
          profile: { create: {} },
        },
      });
    } else if (!user.googleId) {
      // Vincular cuenta existente con Google
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.googleId,
          emailVerified: true,
          avatarUrl: user.avatarUrl || googleUser.avatarUrl,
        },
      });
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.subscriptionStatus,
    );
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  }

  // ─── OAuth Apple ──────────────────────────────────
  async handleAppleAuth(
    appleId: string,
    email: string | null,
    name?: { firstName?: string; lastName?: string },
  ): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({ where: { appleId } });

    if (!user && email) {
      user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
    }

    if (!user) {
      if (!email) {
        throw new BadRequestException(
          'Apple Sign In requiere email en el primer registro',
        );
      }
      const fullName = [name?.firstName, name?.lastName]
        .filter(Boolean)
        .join(' ');

      user = await this.prisma.user.create({
        data: {
          email: email.toLowerCase(),
          appleId,
          name: fullName || null,
          emailVerified: true,
          profile: { create: {} },
        },
      });
    } else if (!user.appleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { appleId, emailVerified: true },
      });
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.subscriptionStatus,
    );
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        onboardingCompleted: user.onboardingCompleted,
      },
      tokens,
    };
  }

  // ─── Verificación de email ────────────────────────
  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Token de verificación inválido');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });
  }

  // ─── Recuperación de contraseña ───────────────────
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) return; // No revelar si existe o no el email

    const resetToken = nanoid(32);
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry: expiry },
    });

    await this.emailService
      .sendPasswordResetEmail(user.email, user.name || 'Usuario', resetToken)
      .catch((err) => this.logger.error('Error enviando email reset', err));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Revocar todos los refresh tokens del usuario por seguridad
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });
  }

  // ─── getMe ────────────────────────────────────────
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: true,
        profile: {
          select: {
            age: true,
            sex: true,
            weight: true,
            height: true,
            activityLevel: true,
            goal: true,
            tdee: true,
            bmr: true,
            targetCalories: true,
            targetProtein: true,
            targetCarbs: true,
            targetFat: true,
            targetFiber: true,
            unitSystem: true,
            currentStreak: true,
            longestStreak: true,
            totalLogsCount: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  // ─── Helpers privados ─────────────────────────────
  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    subscriptionStatus: string,
  ): Promise<TokenPair> {
    const payload = { sub: userId, email, role, subscriptionStatus };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '30d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutos en segundos
    };
  }

  private async saveRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    // Limpiar tokens viejos revocados (mantener solo los activos)
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
      },
    });

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  }
}
