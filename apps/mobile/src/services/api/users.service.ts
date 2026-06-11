import { apiClient } from './client';

export const usersService = {
  async completeOnboarding(data: Record<string, any>): Promise<any> {
    const res = await apiClient.post('/api/v1/users/onboarding', data);
    return res.data.data;
  },

  async getProfile(): Promise<any> {
    const res = await apiClient.get('/api/v1/users/profile');
    return res.data.data;
  },

  async updateProfile(data: Record<string, any>): Promise<any> {
    const res = await apiClient.patch('/api/v1/users/profile', data);
    return res.data.data;
  },

  async getDashboard(): Promise<any> {
    const res = await apiClient.get('/api/v1/users/dashboard');
    return res.data.data;
  },

  async getWeeklySummary(): Promise<any> {
    const res = await apiClient.get('/api/v1/users/weekly-summary');
    return res.data.data;
  },

  async logWeight(weightKg: number, date?: string): Promise<any> {
    const res = await apiClient.post('/api/v1/users/weight', { weightKg, date });
    return res.data.data;
  },

  async getWeightHistory(): Promise<any[]> {
    const res = await apiClient.get('/api/v1/users/weight');
    return res.data.data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/api/v1/users/change-password', { currentPassword, newPassword });
  },
};
