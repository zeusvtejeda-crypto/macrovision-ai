import { apiClient } from './client';

export const diaryService = {
  async getDailyDiary(date: string): Promise<any> {
    const res = await apiClient.get(`/api/v1/diary?date=${date}`);
    return res.data.data;
  },

  async addFoodEntry(data: {
    foodId: string;
    grams: number;
    mealType: string;
    date?: string;
  }): Promise<any> {
    const res = await apiClient.post('/api/v1/diary/entries', data);
    return res.data.data;
  },

  async deleteEntry(entryId: string): Promise<void> {
    await apiClient.delete(`/api/v1/diary/entries/${entryId}`);
  },

  async updateEntry(entryId: string, data: { grams?: number; mealType?: string }): Promise<any> {
    const res = await apiClient.patch(`/api/v1/diary/entries/${entryId}`, data);
    return res.data.data;
  },
};
