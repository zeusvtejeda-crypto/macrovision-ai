import { apiClient } from './client';

export const foodAnalysisService = {
  async analyzeImage(imageUri: string, mealType: string): Promise<any> {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'food.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';

    formData.append('image', {
      uri: imageUri,
      name: filename,
      type: ext === 'png' ? 'image/png' : 'image/jpeg',
    } as any);
    formData.append('mealType', mealType);

    const res = await apiClient.post('/api/v1/analysis', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    });
    return res.data.data;
  },

  async getAnalysis(id: string): Promise<any> {
    const res = await apiClient.get(`/api/v1/analysis/${id}`);
    return res.data.data;
  },

  async correctAnalysis(analysisId: string, itemId: string, portionSize: number): Promise<any> {
    const res = await apiClient.patch(`/api/v1/analysis/${analysisId}/correct`, {
      items: [{ id: itemId, portionSize, userCorrected: true }],
    });
    return res.data.data;
  },

  async addToDiary(analysisId: string, mealType: string): Promise<void> {
    await apiClient.post(`/api/v1/analysis/${analysisId}/add-to-diary`, { mealType });
  },

  async submitFeedback(analysisId: string, rating: number, comment?: string): Promise<void> {
    await apiClient.post(`/api/v1/analysis/${analysisId}/feedback`, { rating, comment });
  },
};
