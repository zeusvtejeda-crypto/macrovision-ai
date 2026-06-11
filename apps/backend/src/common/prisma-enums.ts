export const UserRole = {
  USER: 'USER', PREMIUM: 'PREMIUM', ADMIN: 'ADMIN', SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SubscriptionStatus = {
  FREE: 'FREE', TRIAL: 'TRIAL', ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED', PAST_DUE: 'PAST_DUE', PAUSED: 'PAUSED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const MealType = {
  BREAKFAST: 'BREAKFAST', LUNCH: 'LUNCH', DINNER: 'DINNER', SNACK: 'SNACK',
  PRE_WORKOUT: 'PRE_WORKOUT', POST_WORKOUT: 'POST_WORKOUT',
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

export const FoodSource = {
  USDA: 'USDA', OPEN_FOOD_FACTS: 'OPEN_FOOD_FACTS', AI_GENERATED: 'AI_GENERATED',
  USER_CREATED: 'USER_CREATED', ADMIN_VERIFIED: 'ADMIN_VERIFIED', CUSTOM: 'CUSTOM',
} as const;
export type FoodSource = (typeof FoodSource)[keyof typeof FoodSource];

export const AnalysisStatus = {
  PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED',
  FAILED: 'FAILED', PARTIALLY_COMPLETED: 'PARTIALLY_COMPLETED',
} as const;
export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus];

export const Sex = {
  MALE: 'MALE', FEMALE: 'FEMALE', OTHER: 'OTHER', PREFER_NOT_TO_SAY: 'PREFER_NOT_TO_SAY',
} as const;
export type Sex = (typeof Sex)[keyof typeof Sex];

export const ActivityLevel = {
  SEDENTARY: 'SEDENTARY', LIGHTLY_ACTIVE: 'LIGHTLY_ACTIVE', MODERATELY_ACTIVE: 'MODERATELY_ACTIVE',
  VERY_ACTIVE: 'VERY_ACTIVE', EXTREMELY_ACTIVE: 'EXTREMELY_ACTIVE',
} as const;
export type ActivityLevel = (typeof ActivityLevel)[keyof typeof ActivityLevel];

export const UserGoal = {
  LOSE_FAT: 'LOSE_FAT', MAINTAIN_WEIGHT: 'MAINTAIN_WEIGHT', GAIN_MUSCLE: 'GAIN_MUSCLE',
} as const;
export type UserGoal = (typeof UserGoal)[keyof typeof UserGoal];

export const UnitSystem = { METRIC: 'METRIC', IMPERIAL: 'IMPERIAL' } as const;
export type UnitSystem = (typeof UnitSystem)[keyof typeof UnitSystem];

export const SubscriptionPlan = {
  MONTHLY: 'MONTHLY', ANNUAL: 'ANNUAL', LIFETIME: 'LIFETIME',
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const PaymentStatus = {
  PENDING: 'PENDING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentProvider = {
  STRIPE: 'STRIPE', APP_STORE: 'APP_STORE', GOOGLE_PLAY: 'GOOGLE_PLAY',
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const NotificationType = {
  STREAK_REMINDER: 'STREAK_REMINDER', GOAL_ACHIEVED: 'GOAL_ACHIEVED',
  WEEKLY_SUMMARY: 'WEEKLY_SUMMARY', SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
  AI_ANALYSIS_COMPLETE: 'AI_ANALYSIS_COMPLETE', SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
