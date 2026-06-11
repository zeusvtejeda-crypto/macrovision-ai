import {
  IsEnum,
  IsString,
  IsDateString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsPositive,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@enums';

export class AddFoodToEntryDto {
  @ApiProperty({ description: 'ID del alimento en la BD' })
  @IsString()
  foodItemId: string;

  @ApiProperty({ description: 'Porción en gramos', example: 150 })
  @IsNumber()
  @IsPositive()
  portionSize: number;

  @ApiPropertyOptional({ example: '1 taza' })
  @IsOptional()
  @IsString()
  portionDisplay?: string;
}

export class CreateDiaryEntryDto {
  @ApiProperty({ example: '2024-01-15' })
  @IsDateString()
  date: string;

  @ApiProperty({ enum: MealType })
  @IsEnum(MealType)
  mealType: MealType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mealName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [AddFoodToEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddFoodToEntryDto)
  foods?: AddFoodToEntryDto[];
}

export class UpdateDiaryEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mealName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QuickAddFoodDto {
  @ApiProperty()
  @IsString()
  diaryEntryId: string;

  @ApiProperty()
  @IsString()
  foodItemId: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  portionSize: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portionDisplay?: string;
}
