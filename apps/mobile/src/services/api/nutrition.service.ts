import { apiClient } from './client';

export const nutritionService = {
  async searchFoods(query: string, limit = 20): Promise<any[]> {
    const res = await apiClient.get(
      `/api/v1/nutrition/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    return res.data.data;
  },

  async searchByBarcode(barcode: string): Promise<any | null> {
    const res = await apiClient.get(`/api/v1/nutrition/barcode/${barcode}`);
    return res.data.data;
  },

  async getRecentFoods(): Promise<any[]> {
    const res = await apiClient.get('/api/v1/nutrition/recent');
    return res.data.data;
  },

  async getFrequentFoods(): Promise<any[]> {
    const res = await apiClient.get('/api/v1/nutrition/frequent');
    return res.data.data;
  },

  async getFoodById(id: string): Promise<any> {
    const res = await apiClient.get(`/api/v1/nutrition/${id}`);
    return res.data.data;
  },
};
