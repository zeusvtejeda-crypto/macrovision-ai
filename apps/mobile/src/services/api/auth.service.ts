import { apiClient } from './client';
import {
  AuthUser,
  AuthTokens,
  OnboardingData,
  ApiResponse,
} from '@macrovision/shared-types';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export const authService = {
  async login(data: LoginDto): Promise<AuthResponse> {
    const res = await apiClient.post<any, ApiResponse<AuthResponse>>(
      '/api/v1/auth/login',
      data,
    );
    return res.data;
  },

  async register(data: RegisterDto): Promise<AuthResponse> {
    const res = await apiClient.post<any, ApiResponse<AuthResponse>>(
      '/api/v1/auth/register',
      data,
    );
    return res.data;
  },

  async getMe(): Promise<AuthUser> {
    const res = await apiClient.get<any, ApiResponse<AuthUser>>(
      '/api/v1/auth/me',
    );
    return res.data;
  },

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const res = await apiClient.post<any, ApiResponse<AuthTokens>>(
      '/api/v1/auth/refresh',
      { refreshToken },
    );
    return res.data;
  },

  async forgotPassword(email: string): Promise<void> {
    await apiClient.post('/api/v1/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await apiClient.post('/api/v1/auth/reset-password', { token, password });
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/api/v1/auth/logout', { refreshToken });
  },

  async completeOnboarding(data: OnboardingData): Promise<AuthUser> {
    const res = await apiClient.post<any, ApiResponse<AuthUser>>(
      '/api/v1/users/onboarding',
      data,
    );
    return res.data;
  },

  async googleAuth(idToken: string): Promise<AuthResponse> {
    const res = await apiClient.post<any, ApiResponse<AuthResponse>>(
      '/api/v1/auth/google/mobile',
      { idToken },
    );
    return res.data;
  },

  async appleAuth(
    identityToken: string,
    authorizationCode: string,
    fullName?: { firstName?: string; lastName?: string },
  ): Promise<AuthResponse> {
    const res = await apiClient.post<any, ApiResponse<AuthResponse>>(
      '/api/v1/auth/apple/mobile',
      { identityToken, authorizationCode, fullName },
    );
    return res.data;
  },
};
