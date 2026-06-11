import Constants from 'expo-constants';

// URL base del API — configurar por entorno
export const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000';

// Claves de almacenamiento seguro
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'macrovision_access_token',
  REFRESH_TOKEN: 'macrovision_refresh_token',
  USER_DATA: 'macrovision_user_data',
  ONBOARDING_DONE: 'macrovision_onboarding_done',
} as const;

// Límites del plan FREE
export const FREE_PLAN_LIMITS = {
  DAILY_ANALYSES: 3,
  HISTORY_DAYS: 7,
} as const;

// Configuración de análisis IA
export const AI_CONFIG = {
  IMAGE_MAX_SIZE_MB: 5,
  IMAGE_QUALITY: 0.8,
  IMAGE_MAX_WIDTH: 1024,
  IMAGE_MAX_HEIGHT: 1024,
  TIMEOUT_MS: 30000,
} as const;

// Animaciones
export const ANIMATION_CONFIG = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Nombres de rutas
export const ROUTES = {
  // Auth
  LOGIN: 'login',
  REGISTER: 'register',
  FORGOT_PASSWORD: 'forgot-password',
  ONBOARDING: 'onboarding',

  // Main tabs
  DASHBOARD: 'dashboard',
  CAMERA: 'camera',
  DIARY: 'diary',
  PROFILE: 'profile',

  // Analysis
  ANALYSIS_RESULT: 'analysis-result',
  ANALYSIS_HISTORY: 'analysis-history',
} as const;

// Tipo de comida → etiqueta en español
export const MEAL_TYPE_LABELS: Record<string, string> = {
  BREAKFAST: 'Desayuno',
  LUNCH: 'Comida',
  DINNER: 'Cena',
  SNACK: 'Snack',
  PRE_WORKOUT: 'Pre-Entreno',
  POST_WORKOUT: 'Post-Entreno',
} as const;

// Nivel de actividad → multiplicador TDEE y etiqueta
export const ACTIVITY_LEVELS = [
  {
    value: 'SEDENTARY',
    label: 'Sedentario',
    description: 'Poco o ningún ejercicio',
    multiplier: 1.2,
  },
  {
    value: 'LIGHTLY_ACTIVE',
    label: 'Levemente activo',
    description: '1-3 días de ejercicio por semana',
    multiplier: 1.375,
  },
  {
    value: 'MODERATELY_ACTIVE',
    label: 'Moderadamente activo',
    description: '3-5 días de ejercicio por semana',
    multiplier: 1.55,
  },
  {
    value: 'VERY_ACTIVE',
    label: 'Muy activo',
    description: '6-7 días de ejercicio intenso',
    multiplier: 1.725,
  },
  {
    value: 'EXTREMELY_ACTIVE',
    label: 'Extremadamente activo',
    description: 'Atleta profesional o trabajo físico',
    multiplier: 1.9,
  },
] as const;
