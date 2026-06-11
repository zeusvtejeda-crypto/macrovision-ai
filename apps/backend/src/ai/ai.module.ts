import { Module, Global } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { GeminiService } from './gemini.service';
import { NutritionDbService } from './nutrition-db.service';

@Global()
@Module({
  providers: [OpenAiService, GeminiService, NutritionDbService],
  exports: [OpenAiService, GeminiService, NutritionDbService],
})
export class AiModule {}
