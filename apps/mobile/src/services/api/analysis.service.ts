import { apiClient } from './client';
import {
  FoodAnalysis,
  AnalysisRequest,
  ApiResponse,
  PaginatedResponse,
  MealType,
} from '@macrovision/shared-types';

export interface CorrectAnalysisDto {
  items: Array<{
    id: string;
    portionSize?: number;
    cookingMethod?: string;
    userCorrected?: boolean;
  }>;
  mealType?: MealType;
}

export const analysisService = {
  async analyzeImage(data: AnalysisRequest): Promise<FoodAnalysis> {
    const formData = new FormData();

    if (data.imageUri) {
      const filename = data.imageUri.split('/').pop() || 'food.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      formData.append('image', {
        uri: data.imageUri,
        name: filename,
        type: mimeType,
      } as any);
    }

    if (data.mealType) formData.append('mealType', data.mealType);
    if (data.mealDate) formData.append('mealDate', data.mealDate);
    if (data.additionalContext)
      formData.append('additionalContext', data.additionalContext);

    const res = await apiClient.post<any, ApiResponse<FoodAnalysis>>(
      '/api/v1/analysis',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 60s para análisis IA
      },
    );
    return res.data;
  },

  async getAnalysis(id: string): Promise<FoodAnalysis> {
    const res = await apiClient.get<any, ApiResponse<FoodAnalysis>>(
      `/api/v1/analysis/${id}`,
    );
    return res.data;
  },

  async getHistory(
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<FoodAnalysis>> {
    const res = await apiClient.get<
      any,
      ApiResponse<PaginatedResponse<FoodAnalysis>>
    >(`/api/v1/analysis?page=${page}&limit=${limit}`);
    return res.data;
  },

  async correctAnalysis(
    id: string,
    data: CorrectAnalysisDto,
  ): Promise<FoodAnalysis> {
    const res = await apiClient.patch<any, ApiResponse<FoodAnalysis>>(
      `/api/v1/analysis/${id}/correct`,
      data,
    );
    return res.data;
  },

  async addToDiary(analysisId: string, mealType: MealType): Promise<void> {
    await apiClient.post(`/api/v1/analysis/${analysisId}/add-to-diary`, {
      mealType,
    });
  },

  async submitFeedback(
    analysisId: string,
    rating: number,
    comment?: string,
    actualCalories?: number,
  ): Promise<void> {
    await apiClient.post(`/api/v1/analysis/${analysisId}/feedback`, {
      rating,
      comment,
      actualCalories,
    });
  },
};
