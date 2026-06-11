import { NutritionDbService } from './nutrition-db.service';

describe('NutritionDbService — mergeWithDbFood', () => {
  let service: NutritionDbService;

  beforeEach(() => {
    service = new NutritionDbService(null as any, null as any);
  });

  describe('60/40 blend logic', () => {
    it('should blend AI and DB values at 60/40 ratio', () => {
      const aiItem = { calories: 200, protein: 10, carbohydrates: 20, fat: 8, portionSize: 100 };
      const dbFood = {
        caloriesPer100g: 300,
        proteinPer100g: 20,
        carbohydratesPer100g: 30,
        fatPer100g: 12,
      };

      const result = (service as any).mergeWithDbFood(aiItem, dbFood);

      // DB contributes 60%, AI 40%
      // calories: 300 (db) * 0.6 + 200 (ai) * 0.4 = 180 + 80 = 260
      expect(result.calories).toBeCloseTo(260, 0);
      expect(result.protein).toBeCloseTo(16, 0); // 20*0.6 + 10*0.4
      expect(result.carbohydrates).toBeCloseTo(26, 0); // 30*0.6 + 20*0.4
    });

    it('should sanitize negative values to 0', () => {
      const aiItem = { calories: -50, protein: -5, carbohydrates: 20, fat: 8, portionSize: 100 };
      const dbFood = {
        caloriesPer100g: 200,
        proteinPer100g: 10,
        carbohydratesPer100g: 30,
        fatPer100g: 8,
      };

      const result = (service as any).mergeWithDbFood(aiItem, dbFood);
      expect(result.calories).toBeGreaterThanOrEqual(0);
      expect(result.protein).toBeGreaterThanOrEqual(0);
    });
  });
});
