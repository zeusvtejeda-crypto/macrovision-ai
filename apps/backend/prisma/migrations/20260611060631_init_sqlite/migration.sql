-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "name" TEXT,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "appleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionExpiry" DATETIME,
    "stripeCustomerId" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME,
    "lastActiveAt" DATETIME
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "sex" TEXT,
    "weight" REAL,
    "height" REAL,
    "activityLevel" TEXT,
    "goal" TEXT,
    "bmr" REAL,
    "tdee" REAL,
    "targetCalories" REAL,
    "targetProtein" REAL,
    "targetCarbs" REAL,
    "targetFat" REAL,
    "targetFiber" REAL,
    "proteinPercent" REAL DEFAULT 30,
    "carbsPercent" REAL DEFAULT 40,
    "fatPercent" REAL DEFAULT 30,
    "unitSystem" TEXT NOT NULL DEFAULT 'METRIC',
    "language" TEXT NOT NULL DEFAULT 'es',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "dietaryRestrictions" TEXT NOT NULL DEFAULT '[]',
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "cuisinePreferences" TEXT NOT NULL DEFAULT '[]',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalLogsCount" INTEGER NOT NULL DEFAULT 0,
    "lastLogDate" DATETIME,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "weight_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "bodyFat" REAL,
    "muscleMass" REAL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "weight_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "food_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameEs" TEXT,
    "namePlural" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL,
    "carbohydrates" REAL NOT NULL,
    "fat" REAL NOT NULL,
    "fiber" REAL DEFAULT 0,
    "sugar" REAL DEFAULT 0,
    "sodium" REAL DEFAULT 0,
    "potassium" REAL,
    "calcium" REAL,
    "iron" REAL,
    "vitaminC" REAL,
    "saturatedFat" REAL,
    "transFat" REAL,
    "cholesterol" REAL,
    "servingSize" REAL DEFAULT 100,
    "servingUnit" TEXT DEFAULT 'g',
    "servingSizeAlt" REAL,
    "servingUnitAlt" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CUSTOM',
    "externalId" TEXT,
    "barcode" TEXT,
    "usdaFoodId" TEXT,
    "aiEnriched" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" REAL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "food_analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePath" TEXT,
    "imageThumbnailUrl" TEXT,
    "mealType" TEXT,
    "mealDate" DATETIME,
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
    "confidenceScore" REAL,
    "confidenceLabel" TEXT,
    "totalCalories" REAL,
    "totalProtein" REAL,
    "totalCarbs" REAL,
    "totalFat" REAL,
    "totalFiber" REAL,
    "totalSodium" REAL,
    "userCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctedAt" DATETIME,
    "dbVerified" BOOLEAN NOT NULL DEFAULT false,
    "dbVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "food_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "food_analysis_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "detectedName" TEXT NOT NULL,
    "detectedNameEs" TEXT,
    "portionSize" REAL NOT NULL,
    "portionUnit" TEXT NOT NULL DEFAULT 'g',
    "portionDisplay" TEXT,
    "cookingMethod" TEXT,
    "isMainIngredient" BOOLEAN NOT NULL DEFAULT false,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL,
    "carbohydrates" REAL NOT NULL,
    "fat" REAL NOT NULL,
    "fiber" REAL,
    "sodium" REAL,
    "confidenceScore" REAL,
    "alternativeNames" TEXT NOT NULL DEFAULT '[]',
    "userPortionSize" REAL,
    "userCorrected" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "food_analysis_items_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "food_analysis_items_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "food_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "diary_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "mealType" TEXT NOT NULL,
    "mealName" TEXT,
    "analysisId" TEXT,
    "totalCalories" REAL NOT NULL DEFAULT 0,
    "totalProtein" REAL NOT NULL DEFAULT 0,
    "totalCarbs" REAL NOT NULL DEFAULT 0,
    "totalFat" REAL NOT NULL DEFAULT 0,
    "totalFiber" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "photo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "diary_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "diary_entries_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "diary_entry_foods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diaryEntryId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "portionSize" REAL NOT NULL,
    "portionUnit" TEXT NOT NULL DEFAULT 'g',
    "portionDisplay" TEXT,
    "calories" REAL NOT NULL,
    "protein" REAL NOT NULL,
    "carbohydrates" REAL NOT NULL,
    "fat" REAL NOT NULL,
    "fiber" REAL,
    "sodium" REAL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "diary_entry_foods_diaryEntryId_fkey" FOREIGN KEY ("diaryEntryId") REFERENCES "diary_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "diary_entry_foods_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "food_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalSubscriptionId" TEXT,
    "externalProductId" TEXT,
    "externalPriceId" TEXT,
    "currentPeriodStart" DATETIME NOT NULL,
    "currentPeriodEnd" DATETIME NOT NULL,
    "trialStart" DATETIME,
    "trialEnd" DATETIME,
    "canceledAt" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "amount" REAL,
    "currency" TEXT DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "externalId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "paidAt" DATETIME,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "actualCalories" REAL,
    "issues" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_feedback_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "food_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ai_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT,
    "readAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_stripeCustomerId_idx" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "weight_logs_userId_date_idx" ON "weight_logs"("userId", "date");

-- CreateIndex
CREATE INDEX "food_items_name_idx" ON "food_items"("name");

-- CreateIndex
CREATE INDEX "food_items_nameEs_idx" ON "food_items"("nameEs");

-- CreateIndex
CREATE INDEX "food_items_barcode_idx" ON "food_items"("barcode");

-- CreateIndex
CREATE INDEX "food_analyses_userId_createdAt_idx" ON "food_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "food_analyses_status_idx" ON "food_analyses"("status");

-- CreateIndex
CREATE INDEX "food_analysis_items_analysisId_idx" ON "food_analysis_items"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "diary_entries_analysisId_key" ON "diary_entries"("analysisId");

-- CreateIndex
CREATE INDEX "diary_entries_userId_date_idx" ON "diary_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "diary_entries_userId_date_mealType_key" ON "diary_entries"("userId", "date", "mealType");

-- CreateIndex
CREATE INDEX "diary_entry_foods_diaryEntryId_idx" ON "diary_entry_foods"("diaryEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "payments_subscriptionId_idx" ON "payments"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_feedback_analysisId_key" ON "ai_feedback"("analysisId");

-- CreateIndex
CREATE INDEX "admin_logs_adminId_idx" ON "admin_logs"("adminId");

-- CreateIndex
CREATE INDEX "admin_logs_createdAt_idx" ON "admin_logs"("createdAt");

-- CreateIndex
CREATE INDEX "user_notifications_userId_readAt_idx" ON "user_notifications"("userId", "readAt");
