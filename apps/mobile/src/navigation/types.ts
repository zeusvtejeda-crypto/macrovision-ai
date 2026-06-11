import { NavigatorScreenParams } from '@react-navigation/native';
import { FoodAnalysis } from '@macrovision/shared-types';

// ─── Auth Stack ───────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// ─── Onboarding Stack ─────────────────────────────
export type OnboardingStackParamList = {
  Onboarding: undefined;
};

// ─── Analysis Stack ───────────────────────────────
export type AnalysisStackParamList = {
  AnalysisResult: { analysis: FoodAnalysis };
  AnalysisHistory: undefined;
  AnalysisDetail: { analysisId: string };
};

// ─── Main Tab Navigator ───────────────────────────
export type MainTabParamList = {
  Dashboard: undefined;
  Diary: { date?: string } | undefined;
  Camera: undefined;
  Nutrition: undefined;
  Profile: undefined;
};

// ─── Root Stack ───────────────────────────────────
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  AnalysisResult: { analysisId: string };
  FoodSearch: { diaryEntryId?: string; date?: string; mealType?: string };
  Premium: undefined;
};
