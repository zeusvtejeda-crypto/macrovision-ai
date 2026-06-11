// =============================================
// MacroVision AI — Shared TypeScript Types
// Compartidos entre backend, mobile y admin
// =============================================

// ─── Enums (mirror de Prisma) ────────────────

export enum UserRole {
  USER = 'USER',
  PREMIUM = 'PREMIUM',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum SubscriptionStatus {
  FREE = 'FREE',
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELED = 'CANCELED',
  PAST_DUE = 'PAST_DUE',
}

export enum SubscriptionPlan {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
  LIFETIME = 'LIFETIME',
}

export enum Sex {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum ActivityLevel {
  SEDENTARY = 'SEDENTARY',
  LIGHTLY_ACTIVE = 'LIGHTLY_ACTIVE',
  MODERATELY_ACTIVE = 'MODERATELY_ACTIVE',
  VERY_ACTIVE = 'VERY_ACTIVE',
  EXTREMELY_ACTIVE = 'EXTREMELY_ACTIVE',
}

export enum UserGoal {
  LOSE_FAT = 'LOSE_FAT',
  MAINTAIN_WEIGHT = 'MAINTAIN_WEIGHT',
  GAIN_MUSCLE = 'GAIN_MUSCLE',
}

export enum MealType {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
  SNACK = 'SNACK',
  PRE_WORKOUT = 'PRE_WORKOUT',
  POST_WORKOUT = 'POST_WORKOUT',
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
}

export enum UnitSystem {
  METRIC = 'METRIC',
  IMPERIAL = 'IMPERIAL',
}

// ─── Interfaces de API ────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─── Auth ─────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  onboardingCompleted: boolean;
}

// ─── User & Profile ───────────────────────────

export interface UserProfile {
  id: string;
  userId: string;
  age: number | null;
  sex: Sex | null;
  weight: number | null;
  height: number | null;
  activityLevel: ActivityLevel | null;
  goal: UserGoal | null;
  bmr: number | null;
  tdee: number | null;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFat: number | null;
  targetFiber: number | null;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
  unitSystem: UnitSystem;
  language: string;
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  totalLogsCount: number;
  lastLogDate: string | null;
}

// ─── Macros y Nutrición ───────────────────────

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  sugar?: number;
}

export interface DailyMacroGoals extends MacroNutrients {
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
}

export interface DailyProgress {
  date: string;
  consumed: MacroNutrients;
  goal: DailyMacroGoals;
  remaining: MacroNutrients;
  percentComplete: number;
}

// ─── Food Analysis ────────────────────────────

export interface FoodAnalysisItem {
  id: string;
  detectedName: string;
  detectedNameEs: string | null;
  portionSize: number;
  portionUnit: string;
  portionDisplay: string | null;
  cookingMethod: string | null;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  confidenceScore: number | null;
  alternativeNames: string[];
  userCorrected: boolean;
  isMainIngredient: boolean;
}

export interface FoodAnalysis {
  id: string;
  userId: string;
  imageUrl: string;
  imageThumbnailUrl: string | null;
  mealType: MealType | null;
  status: AnalysisStatus;
  mealName: string | null;
  mealDescription: string | null;
  cookingMethod: string | null;
  cuisineType: string | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
  totalCalories: number | null;
  totalProtein: number | null;
  totalCarbs: number | null;
  totalFat: number | null;
  totalFiber: number | null;
  userCorrected: boolean;
  items: FoodAnalysisItem[];
  createdAt: string;
}

export interface AnalysisRequest {
  imageBase64?: string;
  imageUri?: string;
  mealType?: MealType;
  mealDate?: string;
  additionalContext?: string;
}

// ─── Diary ────────────────────────────────────

export interface DiaryEntryFood {
  id: string;
  foodItemId: string;
  foodName: string;
  portionSize: number;
  portionUnit: string;
  portionDisplay: string | null;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
}

export interface DiaryEntry {
  id: string;
  userId: string;
  date: string;
  mealType: MealType;
  mealName: string | null;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  notes: string | null;
  foods: DiaryEntryFood[];
  analysisId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyDiary {
  date: string;
  entries: Record<MealType, DiaryEntry[]>;
  totals: MacroNutrients;
  goals: DailyMacroGoals;
  caloriesRemaining: number;
}

// ─── FoodItem ─────────────────────────────────

export interface FoodItem {
  id: string;
  name: string;
  nameEs: string | null;
  brand: string | null;
  category: string | null;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  servingSize: number | null;
  servingUnit: string | null;
  imageUrl: string | null;
  source: string;
  confidenceScore: number | null;
}

// ─── Subscriptions ────────────────────────────

export interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  amount: number | null;
  currency: string;
}

// ─── Dashboard / Analytics ────────────────────

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  averageCalories: number;
  averageProtein: number;
  averageCarbs: number;
  averageFat: number;
  daysLogged: number;
  calorieGoalMet: number;
  totalAnalyses: number;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastLogDate: string | null;
  totalLogsCount: number;
}

// ─── Onboarding ───────────────────────────────

export interface OnboardingData {
  age: number;
  sex: Sex;
  weight: number;
  height: number;
  activityLevel: ActivityLevel;
  goal: UserGoal;
  unitSystem: UnitSystem;
  dietaryRestrictions?: string[];
  allergies?: string[];
}

export interface TdeeCalculation {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
  activityMultiplier: number;
  explanation: string;
}

// ─── Utilidades ───────────────────────────────

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
