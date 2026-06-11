-- MacroVision AI — Initial Migration (PostgreSQL / Supabase)
-- ============================================================

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "name" TEXT,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "appleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionExpiry" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "sex" TEXT,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "activityLevel" TEXT,
    "goal" TEXT,
    "bmr" DOUBLE PRECISION,
    "tdee" DOUBLE PRECISION,
    "targetCalories" DOUBLE PRECISION,
    "targetProtein" DOUBLE PRECISION,
    "targetCarbs" DOUBLE PRECISION,
    "targetFat" DOUBLE PRECISION,
    "targetFiber" DOUBLE PRECISION,
    "proteinPercent" DOUBLE PRECISION DEFAULT 30,
    "carbsPercent" DOUBLE PRECISION DEFAULT 40,
    "fatPercent" DOUBLE PRECISION DEFAULT 30,
    "unitSystem" TEXT NOT NULL DEFAULT 'METRIC',
    "language" TEXT NOT NULL DEFAULT 'es',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "dietaryRestrictions" TEXT NOT NULL DEFAULT '[]',
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "cuisinePreferences" TEXT NOT NULL DEFAULT '[]',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalLogsCount" INTEGER NOT NULL DEFAULT 0,
    "lastLogDate" TIMESTAMP(3),
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "bodyFat" DOUBLE PRECISION,
    "muscleMass" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEs" TEXT,
    "namePlural" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbohydrates" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION DEFAULT 0,
    "sugar" DOUBLE PRECISION DEFAULT 0,
    "sodium" DOUBLE PRECISION DEFAULT 0,
    "potassium" DOUBLE PRECISION,
    "calcium" DOUBLE PRECISION,
    "iron" DOUBLE PRECISION,
    "vitaminC" DOUBLE PRECISION,
    "saturatedFat" DOUBLE PRECISION,
    "transFat" DOUBLE PRECISION,
    "cholesterol" DOUBLE PRECISION,
    "servingSize" DOUBLE PRECISION DEFAULT 100,
    "servingUnit" TEXT DEFAULT 'g',
    "servingSizeAlt" DOUBLE PRECISION,
    "servingUnitAlt" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    "externalId" TEXT,
    "barcode" TEXT,
    "usdaFoodId" TEXT,
    "aiEnriched" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePath" TEXT,
    "imageThumbnailUrl" TEXT,
    "mealType" TEXT,
    "mealDate" TIMESTAMP(3),
    "rawAiResponse" TEXT,
    "aiModel" TEXT,
    "aiProvider" TEXT,
    "processingTimeMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "mealName" TEXT,
    "mealDescription" TEXT,
    "cookingMethod" TEXT,
    "cuisineType" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "confidenceLabel" TEXT,
    "totalCalories" DOUBLE PRECISION,
    "totalProtein" DOUBLE PRECISION,
    "totalCarbs" DOUBLE PRECISION,
    "totalFat" DOUBLE PRECISION,
    "totalFiber" DOUBLE PRECISION,
    "totalSodium" DOUBLE PRECISION,
    "userCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctedAt" TIMESTAMP(3),
    "dbVerified" BOOLEAN NOT NULL DEFAULT false,
    "dbVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "food_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_analysis_items" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "detectedName" TEXT NOT NULL,
    "detectedNameEs" TEXT,
    "portionSize" DOUBLE PRECISION NOT NULL,
    "portionUnit" TEXT NOT NULL DEFAULT 'g',
    "portionDisplay" TEXT,
    "cookingMethod" TEXT,
    "isMainIngredient" BOOLEAN NOT NULL DEFAULT false,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbohydrates" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "alternativeNames" TEXT NOT NULL DEFAULT '[]',
    "userPortionSize" DOUBLE PRECISION,
    "userCorrected" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "food_analysis_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealType" TEXT NOT NULL,
    "mealName" TEXT,
    "analysisId" TEXT,
    "totalCalories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalProtein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCarbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFiber" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "photo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_entry_foods" (
    "id" TEXT NOT NULL,
    "diaryEntryId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "portionSize" DOUBLE PRECISION NOT NULL,
    "portionUnit" TEXT NOT NULL DEFAULT 'g',
    "portionDisplay" TEXT,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbohydrates" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "diary_entry_foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalSubscriptionId" TEXT,
    "externalProductId" TEXT,
    "externalPriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "externalId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "actualCalories" DOUBLE PRECISION,
    "issues" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_stripeCustomerId_idx" ON "users"("stripeCustomerId");

CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

CREATE INDEX "weight_logs_userId_date_idx" ON "weight_logs"("userId", "date");

CREATE INDEX "food_items_name_idx" ON "food_items"("name");
CREATE INDEX "food_items_nameEs_idx" ON "food_items"("nameEs");
CREATE INDEX "food_items_barcode_idx" ON "food_items"("barcode");

CREATE INDEX "food_analyses_userId_createdAt_idx" ON "food_analyses"("userId", "createdAt");
CREATE INDEX "food_analyses_status_idx" ON "food_analyses"("status");

CREATE INDEX "food_analysis_items_analysisId_idx" ON "food_analysis_items"("analysisId");

CREATE UNIQUE INDEX "diary_entries_analysisId_key" ON "diary_entries"("analysisId");
CREATE UNIQUE INDEX "diary_entries_userId_date_mealType_key" ON "diary_entries"("userId", "date", "mealType");
CREATE INDEX "diary_entries_userId_date_idx" ON "diary_entries"("userId", "date");

CREATE INDEX "diary_entry_foods_diaryEntryId_idx" ON "diary_entry_foods"("diaryEntryId");

CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

CREATE INDEX "payments_subscriptionId_idx" ON "payments"("subscriptionId");

CREATE UNIQUE INDEX "ai_feedback_analysisId_key" ON "ai_feedback"("analysisId");

CREATE INDEX "admin_logs_adminId_idx" ON "admin_logs"("adminId");
CREATE INDEX "admin_logs_createdAt_idx" ON "admin_logs"("createdAt");

CREATE INDEX "user_notifications_userId_readAt_idx" ON "user_notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_analyses" ADD CONSTRAINT "food_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_analysis_items" ADD CONSTRAINT "food_analysis_items_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_analysis_items" ADD CONSTRAINT "food_analysis_items_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "food_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diary_entry_foods" ADD CONSTRAINT "diary_entry_foods_diaryEntryId_fkey" FOREIGN KEY ("diaryEntryId") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diary_entry_foods" ADD CONSTRAINT "diary_entry_foods_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "food_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
