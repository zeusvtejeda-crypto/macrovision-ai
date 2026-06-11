import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiAnalysisResult {
  mealName: string;
  mealDescription: string;
  cookingMethod: string | null;
  cuisineType: string | null;
  confidenceScore: number;
  items: AiDetectedItem[];
  rawResponse: any;
  processingTimeMs: number;
}

export interface AiDetectedItem {
  name: string;
  nameEs: string;
  portionSizeGrams: number;
  portionDisplay: string;
  cookingMethod: string | null;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  confidenceScore: number;
  alternativeNames: string[];
  isMainIngredient: boolean;
}

const SYSTEM_PROMPT = `Eres un nutricionista y chef experto con 20 años de experiencia. Tu especialidad es analizar fotografías de alimentos e identificar su composición nutricional con máxima precisión.

INSTRUCCIONES CRÍTICAS:
1. Analiza TODOS los alimentos visibles en la imagen
2. Estima las porciones basándote en el tamaño visual, recipiente, contexto y escala
3. Considera el método de cocción (horneado, frito, a la plancha, crudo, etc.)
4. Identifica la cocina/gastronomía si es posible (mexicana, italiana, asiática, etc.)
5. Para cada alimento, proporciona la información nutricional POR LA PORCIÓN ESTIMADA (no por 100g)
6. El nivel de confianza debe reflejar qué tan seguro estás de tu identificación
7. Si hay ingredientes ocultos o salsas, estímalos conservadoramente

RESPONDE ÚNICAMENTE en JSON con esta estructura exacta:
{
  "mealName": "string — nombre del platillo completo",
  "mealNameEs": "string — nombre en español",
  "mealDescription": "string — descripción breve de lo que ves",
  "cookingMethod": "string | null",
  "cuisineType": "string | null — tipo de cocina",
  "confidenceScore": 0.0-1.0,
  "items": [
    {
      "name": "string — nombre en inglés",
      "nameEs": "string — nombre en español",
      "portionSizeGrams": number,
      "portionDisplay": "string — ej: '1 taza (240g)', '2 piezas medianas'",
      "cookingMethod": "string | null",
      "calories": number,
      "protein": number,
      "carbohydrates": number,
      "fat": number,
      "fiber": number,
      "confidenceScore": 0.0-1.0,
      "alternativeNames": ["string"],
      "isMainIngredient": boolean
    }
  ]
}`;

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private client: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: configService.get<string>('ai.openai.apiKey'),
    });
    this.model = configService.get<string>('ai.openai.model', 'gpt-4o');
    this.maxTokens = configService.get<number>('ai.openai.maxTokens', 2000);
  }

  async analyzeImage(
    imageBase64: string,
    additionalContext?: string,
  ): Promise<AiAnalysisResult> {
    const start = Date.now();

    const userPrompt = additionalContext
      ? `Analiza esta imagen de alimentos. Contexto adicional: ${additionalContext}`
      : 'Analiza esta imagen de alimentos con máximo detalle.';

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      });

      const processingTimeMs = Date.now() - start;
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI no retornó contenido');
      }

      const parsed = JSON.parse(content);
      this.validateAiResponse(parsed);

      this.logger.log(
        `Análisis OpenAI completado en ${processingTimeMs}ms | Items: ${parsed.items.length} | Confianza: ${parsed.confidenceScore}`,
      );

      return {
        mealName: parsed.mealName || parsed.mealNameEs || 'Alimento desconocido',
        mealDescription: parsed.mealDescription || '',
        cookingMethod: parsed.cookingMethod || null,
        cuisineType: parsed.cuisineType || null,
        confidenceScore: Number(parsed.confidenceScore) || 0.5,
        items: parsed.items.map((item: any) => ({
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
        })),
        rawResponse: parsed,
        processingTimeMs,
      };
    } catch (err: any) {
      this.logger.error(`Error en análisis OpenAI: ${err.message}`);

      if (err.code === 'insufficient_quota') {
        throw new ServiceUnavailableException('Servicio de IA temporalmente no disponible');
      }

      throw err;
    }
  }

  private validateAiResponse(parsed: any): void {
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Respuesta de IA inválida: falta array "items"');
    }
    if (parsed.items.length === 0) {
      throw new Error('La IA no detectó alimentos en la imagen');
    }
  }
}
