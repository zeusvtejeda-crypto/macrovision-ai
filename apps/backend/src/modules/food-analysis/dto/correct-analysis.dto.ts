import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealType } from '@enums';

class ItemCorrectionDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Nueva porción en gramos' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  portionSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cookingMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  userCorrected?: boolean;
}

export class CorrectAnalysisDto {
  @ApiProperty({ type: [ItemCorrectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCorrectionDto)
  items: ItemCorrectionDto[];

  @ApiPropertyOptional({ enum: MealType })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;
}
