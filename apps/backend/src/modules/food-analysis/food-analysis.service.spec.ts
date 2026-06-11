import { Test, TestingModule } from '@nestjs/testing';
import { FoodAnalysisService } from './food-analysis.service';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../../ai/openai.service';
import { GeminiService } from '../../ai/gemini.service';
import { NutritionDbService } from '../../ai/nutrition-db.service';
import { S3Service } from './providers/s3.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  foodAnalysis: {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  diaryEntry: {
    upsert: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockOpenAi = {
  analyzeImage: jest.fn(),
};

const mockGemini = {
  analyzeImage: jest.fn(),
};

const mockNutritionDb = {
  enrichItems: jest.fn(),
};

const mockS3 = {
  uploadImage: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'plans.freeAnalysesPerDay') return 3;
    return undefined;
  }),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockAiResult = {
  mealName: 'Ensalada César',
  mealDescription: 'Ensalada con lechuga, crutones y aderezo',
  cookingMethod: 'raw',
  cuisineType: 'americana',
  confidenceScore: 0.92,
  items: [
    {
      detectedName: 'Caesar Salad',
      detectedNameEs: 'Ensalada César',
      portionSize: 250,
      portionUnit: 'g',
      portionDisplay: '1 plato (250g)',
      calories: 280,
      protein: 12,
      carbohydrates: 15,
      fat: 20,
      fiber: 3,
      confidenceScore: 0.92,
      alternativeNames: [],
      isMainIngredient: true,
    },
  ],
};

const mockPendingAnalysis = {
  id: 'analysis-uuid-1',
  userId: 'user-uuid-1',
  status: 'PENDING',
  imageUrl: 'https://s3.example.com/food.jpg',
};

describe('FoodAnalysisService', () => {
  let service: FoodAnalysisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoodAnalysisService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OpenAiService, useValue: mockOpenAi },
        { provide: GeminiService, useValue: mockGemini },
        { provide: NutritionDbService, useValue: mockNutritionDb },
        { provide: S3Service, useValue: mockS3 },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<FoodAnalysisService>(FoodAnalysisService);
  });

  // ─── Daily limit ───────────────────────────────────────────────────────────

  describe('checkAnalysisLimit', () => {
    it('should allow analysis when under free limit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        subscriptionStatus: 'FREE',
      });
      mockPrisma.foodAnalysis.count.mockResolvedValue(2); // 2 of 3 used

      await expect(
        (service as any).checkAnalysisLimit('user-uuid-1'),
      ).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when free limit reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        subscriptionStatus: 'FREE',
      });
      mockPrisma.foodAnalysis.count.mockResolvedValue(3); // 3 of 3 used

      await expect(
        (service as any).checkAnalysisLimit('user-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow unlimited analyses for ACTIVE subscribers', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        subscriptionStatus: 'ACTIVE',
      });
      mockPrisma.foodAnalysis.count.mockResolvedValue(99);

      await expect(
        (service as any).checkAnalysisLimit('user-uuid-1'),
      ).resolves.not.toThrow();
    });
  });

  // ─── AI Pipeline ──────────────────────────────────────────────────────────

  describe('runAiAnalysis', () => {
    it('should use OpenAI as primary AI', async () => {
      mockOpenAi.analyzeImage.mockResolvedValue(mockAiResult);

      const result = await (service as any).runAiAnalysis('https://s3.example.com/food.jpg');

      expect(mockOpenAi.analyzeImage).toHaveBeenCalledTimes(1);
      expect(mockGemini.analyzeImage).not.toHaveBeenCalled();
      expect(result).toEqual(mockAiResult);
    });

    it('should fall back to Gemini if OpenAI fails', async () => {
      mockOpenAi.analyzeImage.mockRejectedValue(new Error('OpenAI timeout'));
      mockGemini.analyzeImage.mockResolvedValue(mockAiResult);

      const result = await (service as any).runAiAnalysis('https://s3.example.com/food.jpg');

      expect(mockOpenAi.analyzeImage).toHaveBeenCalledTimes(1);
      expect(mockGemini.analyzeImage).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockAiResult);
    });

    it('should throw if both AI providers fail', async () => {
      mockOpenAi.analyzeImage.mockRejectedValue(new Error('OpenAI error'));
      mockGemini.analyzeImage.mockRejectedValue(new Error('Gemini error'));

      await expect(
        (service as any).runAiAnalysis('https://s3.example.com/food.jpg'),
      ).rejects.toThrow();
    });
  });

  // ─── Totals calculation ───────────────────────────────────────────────────

  describe('calculateTotals', () => {
    it('should sum calories and macros from all items', () => {
      const items = [
        { calories: 300, protein: 20, carbohydrates: 30, fat: 10, fiber: 5 },
        { calories: 200, protein: 10, carbohydrates: 25, fat: 8, fiber: 2 },
      ];

      const totals = (service as any).calculateTotals(items);

      expect(totals.totalCalories).toBe(500);
      expect(totals.totalProtein).toBe(30);
      expect(totals.totalCarbohydrates).toBe(55);
      expect(totals.totalFat).toBe(18);
      expect(totals.totalFiber).toBe(7);
    });

    it('should return zeros for empty items', () => {
      const totals = (service as any).calculateTotals([]);
      expect(totals.totalCalories).toBe(0);
    });
  });
});
