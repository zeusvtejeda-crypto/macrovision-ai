import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>('redis.ttl', 3600),
      }),
    }),
  ],
  controllers: [NutritionController],
  providers: [NutritionService],
  exports: [NutritionService, CacheModule],
})
export class NutritionModule {}
