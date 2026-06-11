import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  subscriptionStatus: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        isActive: true,
        onboardingCompleted: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    // Verificar si la suscripción expiró
    if (
      user.subscriptionStatus === 'ACTIVE' &&
      user.subscriptionExpiry &&
      user.subscriptionExpiry < new Date()
    ) {
      // Marcar como expirada (lazy update)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: 'EXPIRED' },
      });
      user.subscriptionStatus = 'EXPIRED' as any;
    }

    return user;
  }
}
