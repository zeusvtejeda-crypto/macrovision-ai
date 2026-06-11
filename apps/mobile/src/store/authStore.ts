import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthUser } from '@macrovision/shared-types';
import { STORAGE_KEYS } from '@constants/config';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: user !== null,
    }),

  setTokens: async (accessToken, refreshToken) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
      SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
    set({ user: null, isAuthenticated: false });
  },

  initialize: async () => {
    set({ isLoading: true });

    try {
      const accessToken = await SecureStore.getItemAsync(
        STORAGE_KEYS.ACCESS_TOKEN,
      );

      if (accessToken) {
        // Validar token con el backend
        const { authService } = await import('@services/api/auth.service');
        const user = await authService.getMe();
        set({ user, isAuthenticated: true });
      }
    } catch {
      // Token inválido o expirado — limpiar
      await get().logout();
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },
}));
