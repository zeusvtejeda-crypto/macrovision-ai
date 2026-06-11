import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { AiAnalysisResult, AiDetectedItem } from './openai.service';

// Reutilizamos el mismo prompt de OpenAI para consistencia
const GEMINI_SYSTEM_PROMPT = `Eres un nutricionista experto. Analiza la imagen de alimentos y retorna ÚNICAMENTE un JSON válido con esta estructura:
{
  "mealName": "nombre del platillo",
  "mealNameEs": "nombre en español",
  "mealDescription": "descripción breve",
  "cookingMethod": "método de cocción o null",
  "cuisineType": "tipo de cocina o null",
  "confidenceScore": 0.0-1.0,
  "items": [{
    "name": "nombre",
    "nameEs": "nombre español",
    "portionSizeGrams": número,
    "portionDisplay": "descripción de porción",
    "cookingMethod": "null o método",
    "calories": número,
    "protein": número,
    "carbohydrates": número,
    "fat": número,
    "fiber": número,
    "confidenceScore": 0.0-1.0,
    "alternativeNames": [],
    "isMainIngredient": true/false
  }]
}`;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private configService: ConfigService) {
    const apiKey = configService.get<string>('ai.gemini.apiKey');
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
    this.modelName = configService.get<string>(
      'ai.gemini.model',
      'gemini-1.5-flash',
    );
  }

  async analyzeImage(
    imageBase64: string,
    additionalContext?: string,
  ): Promise<AiAnalysisResult> {
    const start = Date.now();

    if (!this.client) {
      throw new Error('Gemini API key no configurada');
    }

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 2000,
        temperature: 0.2, // Baja temperatura para respuestas más precisas
      },
    });

    const prompt = additionalContext
      ? `${GEMINI_SYSTEM_PROMPT}\n\nContexto adicional: ${additionalContext}`
      : GEMINI_SYSTEM_PROMPT;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      },
    ]);

    const processingTimeMs = Date.now() - start;
    const text = result.response.text();
    const parsed = JSON.parse(text);

    this.logger.log(
      `Análisis Gemini completado en ${processingTimeMs}ms | Items: ${parsed.items?.length || 0}`,
    );

    return {
      mealName: parsed.mealName || parsed.mealNameEs || 'Alimento',
      mealDescription: parsed.mealDescription || '',
      cookingMethod: parsed.cookingMethod || null,
      cuisineType: parsed.cuisineType || null,
      confidenceScore: Number(parsed.confidenceScore) || 0.5,
      items: (parsed.items || []).map(
        (item: any): AiDetectedItem => ({
          name: item.name,
          nameEs: item.nameEs || item.name,
          portionSizeGrams: Math.max(1, Number(item.portionSizeGrams) || 100),
          portionDisplay: item.portionDisplay || `${item.portionSizeGrams}g`,
          cookingMethod: item.cookingMethod || null,
          calories: Math.max(0, Number(item.calories) || 0),
          protein: Math.max(0, Number(item.protein) || 0),
          carbohydrates: Math.max(0, Number(item.carbohydrates) || 0),
          fat: Math.max(0, Number(item.fat) || 0),
          fiber: Math.max(0, Number(item.fiber) || 0),
          confidenceScore: Number(item.confidenceScore) || 0.5,
          alternativeNames: Array.isArray(item.alternativeNames)
            ? item.alternativeNames
            : [],
          isMainIngredient: Boolean(item.isMainIngredient),
        }),
      ),
      rawResponse: parsed,
      processingTimeMs,
    };
  }
}
