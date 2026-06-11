import { ActivityLevel, Sex, UserGoal } from '@enums';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  EXTREMELY_ACTIVE: 1.9,
};

const GOAL_ADJUSTMENTS: Record<UserGoal, number> = {
  LOSE_FAT: -500,        // Déficit de 500 kcal
  MAINTAIN_WEIGHT: 0,
  GAIN_MUSCLE: 300,      // Superávit de 300 kcal
};

// Distribución de macros por objetivo
const MACRO_RATIOS: Record<
  UserGoal,
  { proteinPercent: number; carbsPercent: number; fatPercent: number }
> = {
  LOSE_FAT: { proteinPercent: 35, carbsPercent: 35, fatPercent: 30 },
  MAINTAIN_WEIGHT: { proteinPercent: 30, carbsPercent: 40, fatPercent: 30 },
  GAIN_MUSCLE: { proteinPercent: 30, carbsPercent: 45, fatPercent: 25 },
};

export interface TdeeInput {
  age: number;
  sex: Sex;
  weight: number;   // kg
  height: number;   // cm
  activityLevel: ActivityLevel;
  goal: UserGoal;
}

export interface TdeeResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;   // gramos
  targetCarbs: number;
  targetFat: number;
  targetFiber: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
  activityMultiplier: number;
  explanation: string;
}

export function calculateTdee(input: TdeeInput): TdeeResult {
  // Fórmula Mifflin-St Jeor (más precisa que Harris-Benedict)
  let bmr: number;

  if (input.sex === Sex.MALE) {
    bmr = 10 * input.weight + 6.25 * input.height - 5 * input.age + 5;
  } else {
    bmr = 10 * input.weight + 6.25 * input.height - 5 * input.age - 161;
  }

  const multiplier = ACTIVITY_MULTIPLIERS[input.activityLevel];
  const tdee = Math.round(bmr * multiplier);

  const goalAdjustment = GOAL_ADJUSTMENTS[input.goal];
  const targetCalories = Math.max(1200, tdee + goalAdjustment); // Mínimo seguro 1200 kcal

  const ratios = MACRO_RATIOS[input.goal];

  // Calcular macros en gramos
  // Proteínas: 4 kcal/g, Carbohidratos: 4 kcal/g, Grasas: 9 kcal/g
  const targetProtein = Math.round((targetCalories * ratios.proteinPercent) / 100 / 4);
  const targetCarbs = Math.round((targetCalories * ratios.carbsPercent) / 100 / 4);
  const targetFat = Math.round((targetCalories * ratios.fatPercent) / 100 / 9);

  // Fibra recomendada: ~14g por cada 1000 kcal (Academy of Nutrition)
  const targetFiber = Math.round((targetCalories / 1000) * 14);

  const goalDescriptions: Record<UserGoal, string> = {
    LOSE_FAT: `déficit de ${Math.abs(goalAdjustment)} kcal para perder aproximadamente 0.5 kg/semana`,
    MAINTAIN_WEIGHT: 'mantenimiento de peso actual',
    GAIN_MUSCLE: `superávit de ${goalAdjustment} kcal para construcción muscular limpia`,
  };

  const explanation =
    `BMR calculado con Mifflin-St Jeor: ${Math.round(bmr)} kcal. ` +
    `Con factor de actividad ${multiplier}x → TDEE: ${tdee} kcal. ` +
    `Ajuste por objetivo (${goalDescriptions[input.goal]}): ${targetCalories} kcal objetivo.`;

  return {
    bmr: Math.round(bmr),
    tdee,
    targetCalories,
    targetProtein,
    targetCarbs,
    targetFat,
    targetFiber,
    proteinPercent: ratios.proteinPercent,
    carbsPercent: ratios.carbsPercent,
    fatPercent: ratios.fatPercent,
    activityMultiplier: multiplier,
    explanation,
  };
}
