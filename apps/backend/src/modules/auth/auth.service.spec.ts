import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../../common/services/email.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, string | number> = {
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '15m',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.refreshExpiresIn': '30d',
    };
    return cfg[key];
  }),
};

const mockEmailService = {
  sendVerificationEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const hashedPassword = bcrypt.hashSync('Test1234!', 10);

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@macrovision.ai',
  name: 'Test User',
  passwordHash: hashedPassword,
  role: 'USER',
  subscriptionStatus: 'FREE',
  onboardingCompleted: false,
  emailVerified: true,
  isActive: true,
  createdAt: new Date(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Default JWT mocks
    mockJwtService.signAsync.mockResolvedValue('mock-token');
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({});
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@macrovision.ai',
        password: 'Test1234!',
        name: 'Test User',
      });

      expect(result.user.email).toBe('test@macrovision.ai');
      expect(result.tokens.accessToken).toBe('mock-token');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@macrovision.ai',
          password: 'Test1234!',
          name: 'Test',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@macrovision.ai',
        password: 'Test1234!',
      });

      expect(result.tokens.accessToken).toBe('mock-token');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@macrovision.ai', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'Test1234!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if account is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login({ email: 'test@macrovision.ai', password: 'Test1234!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Refresh Tokens ────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if token not found', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token is revoked', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        token: 'some-token',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1_000_000),
        user: mockUser,
      });

      await expect(service.refreshTokens('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
