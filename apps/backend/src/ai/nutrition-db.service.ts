import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { AiDetectedItem } from './openai.service';
import { FoodSource } from '@enums';

interface EnrichedItem extends AiDetectedItem {
  foodItemId: string | null;
  dbVerified: boolean;
  adjustedCalories: number;
  adjustedProtein: number;
  adjustedCarbs: number;
  adjustedFat: number;
  adjustedFiber: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  nutrients: Array<{
    nutrientId: number;
    nutrientName: string;
    value: number;
    unitName: string;
  }>;
}

// Nutrient IDs de USDA FoodData Central
const USDA_NUTRIENT_IDS = {
  ENERGY: 1008,    // kcal
  PROTEIN: 1003,   // g
  CARBS: 1005,     // g
  FAT: 1004,       // g
  FIBER: 1079,     // g
};

@Injectable()
export class NutritionDbService {
  private readonly logger = new Logger(NutritionDbService.name);
  private readonly usdaBaseUrl: string;
  private readonly usdaApiKey: string;
  private readonly offBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.usdaBaseUrl = configService.get<string>(
      'usda.baseUrl',
      'https://api.nal.usda.gov/fdc/v1',
    );
    this.usdaApiKey = configService.get<string>('usda.apiKey', '');
    this.offBaseUrl = configService.get<string>(
      'openFoodFacts.baseUrl',
      'https://world.openfoodfacts.org/api/v2',
    );
  }

  // ─── Pipeline de enriquecimiento híbrido ──────────
  async enrichItems(items: AiDetectedItem[]): Promise<EnrichedItem[]> {
    const enriched = await Promise.all(
      items.map((item) => this.enrichSingleItem(item)),
    );
    return enriched;
  }

  private async enrichSingleItem(item: AiDetectedItem): Promise<EnrichedItem> {
    // 1. Buscar primero en nuestra BD local (más rápido, sin costo API)
    const localMatch = await this.findInLocalDb(item.nameEs || item.name);

    if (localMatch && localMatch.confidenceScore && localMatch.confidenceScore > 0.8) {
      return this.mergeWithDbFood(item, localMatch);
    }

    // 2. Si no hay match local, buscar en USDA (si la API key está configurada)
    if (this.usdaApiKey) {
      try {
        const usdaMatch = await this.searchUsda(item.name);
        if (usdaMatch) {
          // Guardar en BD local para futuras consultas
          const saved = await this.saveToLocalDb(usdaMatch, FoodSource.USDA);
          return this.mergeWithDbFood(item, saved);
        }
      } catch (err: any) {
        this.logger.warn(`USDA search failed for "${item.name}": ${err.message}`);
      }
    }

    // 3. Fallback: usar datos de la IA directamente (sin verificación)
    return {
      ...item,
      foodItemId: null,
      dbVerified: false,
      adjustedCalories: item.calories,
      adjustedProtein: item.protein,
      adjustedCarbs: item.carbohydrates,
      adjustedFat: item.fat,
      adjustedFiber: item.fiber,
    };
  }

  // ─── Búsqueda en BD local ─────────────────────────
  async findInLocalDb(name: string) {
    const normalized = name.toLowerCase().trim();

    return this.prisma.foodItem.findFirst({
      where: {
        OR: [
          { name: { contains: normalized } },
          { nameEs: { contains: normalized } },
        ],
      },
      orderBy: [
        { verifiedByAdmin: 'desc' },
        { usageCount: 'desc' },
        { confidenceScore: 'desc' },
      ],
    });
  }

  // ─── Búsqueda en USDA FoodData Central ───────────
  async searchUsda(query: string): Promise<UsdaFood | null> {
    const url = `${this.usdaBaseUrl}/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=${this.usdaApiKey}&dataType=SR Legacy,Foundation,FNDDS`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      throw new Error(`USDA API error: ${response.status}`);
    }

    const data: any = await response.json();

    if (!data.foods || data.foods.length === 0) return null;

    const best = data.foods[0];

    return {
      fdcId: best.fdcId,
      description: best.description,
      nutrients: best.foodNutrients || [],
    };
  }

  // ─── Búsqueda en Open Food Facts (por código de barras) ──
  async searchByBarcode(barcode: string) {
    try {
      const url = `${this.offBaseUrl}/product/${barcode}.json`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      const data: any = await response.json();

      if (data.status !== 1 || !data.product) return null;

      const p = data.product;
      const nutriments = p.nutriments || {};

      return {
        name: p.product_name_es || p.product_name || 'Producto desconocido',
        brand: p.brands,
        barcode,
        calories: nutriments['energy-kcal_100g'] || 0,
        protein: nutriments.proteins_100g || 0,
        carbohydrates: nutriments.carbohydrates_100g || 0,
        fat: nutriments.fat_100g || 0,
        fiber: nutriments.fiber_100g || 0,
        sugar: nutriments.sugars_100g || 0,
        sodium: nutriments.sodium_100g || 0,
        imageUrl: p.image_front_url,
        source: FoodSource.OPEN_FOOD_FACTS,
        externalId: `off-${barcode}`,
      };
    } catch {
      return null;
    }
  }

  // ─── Guardar alimento de API externa en BD ────────
  async saveToLocalDb(food: UsdaFood, source: FoodSource) {
    const nutrients = food.nutrients;

    const getNutrient = (id: number): number => {
      const n = nutrients.find((n) => n.nutrientId === id);
      return n ? Math.max(0, n.value) : 0;
    };

    return this.prisma.foodItem.upsert({
      where: {
        id: `usda-${food.fdcId}`,
      },
      update: { usageCount: { increment: 1 } },
      create: {
        id: `usda-${food.fdcId}`,
        name: food.description,
        source,
        externalId: String(food.fdcId),
        calories: getNutrient(USDA_NUTRIENT_IDS.ENERGY),
        protein: getNutrient(USDA_NUTRIENT_IDS.PROTEIN),
        carbohydrates: getNutrient(USDA_NUTRIENT_IDS.CARBS),
        fat: getNutrient(USDA_NUTRIENT_IDS.FAT),
        fiber: getNutrient(USDA_NUTRIENT_IDS.FIBER),
        aiEnriched: false,
        confidenceScore: 0.9,
        usageCount: 1,
      },
    });
  }

  // ─── Mezclar datos de IA + BD ─────────────────────
  private mergeWithDbFood(item: AiDetectedItem, dbFood: any): EnrichedItem {
    const portion = item.portionSizeGrams / 100;

    // Los datos de BD están en per/100g — calcular para la porción estimada por IA
    const dbCalories = dbFood.calories * portion;
    const dbProtein = dbFood.protein * portion;
    const dbCarbs = dbFood.carbohydrates * portion;
    const dbFat = dbFood.fat * portion;
    const dbFiber = (dbFood.fiber || 0) * portion;

    // Promedio ponderado: 60% BD + 40% IA
    // La BD es más confiable para macros exactos; la IA es mejor para estimar porciones
    const blend = (dbVal: number, aiVal: number) =>
      Math.round((dbVal * 0.6 + aiVal * 0.4) * 10) / 10;

    // Incrementar contador de uso
    this.prisma.foodItem
      .update({
        where: { id: dbFood.id },
        data: { usageCount: { increment: 1 } },
      })
      .catch(() => null);

    return {
      ...item,
      foodItemId: dbFood.id,
      dbVerified: true,
      adjustedCalories: blend(dbCalories, item.calories),
      adjustedProtein: blend(dbProtein, item.protein),
      adjustedCarbs: blend(dbCarbs, item.carbohydrates),
      adjustedFat: blend(dbFat, item.fat),
      adjustedFiber: blend(dbFiber, item.fiber),
    };
  }
}
