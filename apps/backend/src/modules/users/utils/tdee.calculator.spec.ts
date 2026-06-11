import { calculateTDEE } from './tdee.calculator';

describe('calculateTDEE', () => {
  const baseInput = {
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: 'MALE' as const,
    activityLevel: 'MODERATELY_ACTIVE' as const,
    goal: 'MAINTAIN_WEIGHT' as const,
  };

  describe('BMR calculation (Mifflin-St Jeor)', () => {
    it('should calculate correct BMR for male', () => {
      // Male: 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75
      const result = calculateTDEE(baseInput);
      expect(result.bmr).toBeCloseTo(1648.75, 0);
    });

    it('should calculate correct BMR for female', () => {
      // Female: 10*70 + 6.25*175 - 5*30 - 161 = 1482.75
      const result = calculateTDEE({ ...baseInput, sex: 'FEMALE' });
      expect(result.bmr).toBeCloseTo(1482.75, 0);
    });
  });

  describe('TDEE with activity multiplier', () => {
    it('SEDENTARY applies ×1.2', () => {
      const result = calculateTDEE({ ...baseInput, activityLevel: 'SEDENTARY' });
      expect(result.tdee).toBeCloseTo(1648.75 * 1.2, 0);
    });

    it('LIGHTLY_ACTIVE applies ×1.375', () => {
      const result = calculateTDEE({ ...baseInput, activityLevel: 'LIGHTLY_ACTIVE' });
      expect(result.tdee).toBeCloseTo(1648.75 * 1.375, 0);
    });

    it('MODERATELY_ACTIVE applies ×1.55', () => {
      const result = calculateTDEE(baseInput);
      expect(result.tdee).toBeCloseTo(1648.75 * 1.55, 0);
    });

    it('VERY_ACTIVE applies ×1.725', () => {
      const result = calculateTDEE({ ...baseInput, activityLevel: 'VERY_ACTIVE' });
      expect(result.tdee).toBeCloseTo(1648.75 * 1.725, 0);
    });

    it('EXTREMELY_ACTIVE applies ×1.9', () => {
      const result = calculateTDEE({ ...baseInput, activityLevel: 'EXTREMELY_ACTIVE' });
      expect(result.tdee).toBeCloseTo(1648.75 * 1.9, 0);
    });
  });

  describe('goal adjustments', () => {
    it('LOSE_FAT subtracts 500 kcal', () => {
      const maintain = calculateTDEE(baseInput);
      const lose = calculateTDEE({ ...baseInput, goal: 'LOSE_FAT' });
      expect(lose.targetCalories).toBe(maintain.targetCalories - 500);
    });

    it('GAIN_MUSCLE adds 300 kcal', () => {
      const maintain = calculateTDEE(baseInput);
      const gain = calculateTDEE({ ...baseInput, goal: 'GAIN_MUSCLE' });
      expect(gain.targetCalories).toBe(maintain.targetCalories + 300);
    });

    it('MAINTAIN_WEIGHT keeps same calories', () => {
      const result = calculateTDEE(baseInput);
      expect(result.targetCalories).toBe(result.tdee);
    });

    it('minimum calories floor is 1200 kcal', () => {
      const result = calculateTDEE({
        weightKg: 30,
        heightCm: 140,
        age: 80,
        sex: 'FEMALE',
        activityLevel: 'SEDENTARY',
        goal: 'LOSE_FAT',
      });
      expect(result.targetCalories).toBeGreaterThanOrEqual(1200);
    });
  });

  describe('macro ratios', () => {
    it('protein + carbs + fat percentages sum to ~100%', () => {
      const result = calculateTDEE(baseInput);
      const total = result.proteinPercent + result.carbsPercent + result.fatPercent;
      expect(total).toBe(100);
    });

    it('macro grams match calorie percentages', () => {
      const result = calculateTDEE(baseInput);
      const calculatedCalories =
        result.targetProtein * 4 +
        result.targetCarbs * 4 +
        result.targetFat * 9;
      // Allow ±5% rounding tolerance
      expect(Math.abs(calculatedCalories - result.targetCalories)).toBeLessThan(
        result.targetCalories * 0.05,
      );
    });

    it('fiber is approximately 14g per 1000 kcal', () => {
      const result = calculateTDEE(baseInput);
      const expectedFiber = Math.round((result.targetCalories / 1000) * 14);
      expect(result.targetFiber).toBe(expectedFiber);
    });
  });
});
