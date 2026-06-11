import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@enums';

export class CreateAnalysisDto {
  @ApiPropertyOptional({ enum: MealType })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  mealDate?: string;

  @ApiPropertyOptional({ example: 'Comida mexicana, almuerzo en restaurante' })
  @IsOptional()
  @IsString()
  additionalContext?: string;
}
