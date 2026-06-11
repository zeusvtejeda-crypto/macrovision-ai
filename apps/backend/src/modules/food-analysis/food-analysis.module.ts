import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FoodAnalysisController } from './food-analysis.controller';
import { FoodAnalysisService } from './food-analysis.service';
import { S3Service } from './providers/s3.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    MulterModule.register({
      storage: memoryStorage(), // Procesar en memoria antes de subir a S3
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  ],
  controllers: [FoodAnalysisController],
  providers: [FoodAnalysisService, S3Service],
  exports: [FoodAnalysisService],
})
export class FoodAnalysisModule {}
