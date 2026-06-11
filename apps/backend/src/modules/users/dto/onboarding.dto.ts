import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsArray,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Sex, ActivityLevel, UserGoal, UnitSystem } from '@enums';

export class OnboardingDto {
  @ApiProperty({ example: 28 })
  @IsInt()
  @Min(13)
  @Max(100)
  age: number;

  @ApiProperty({ enum: Sex })
  @IsEnum(Sex)
  sex: Sex;

  @ApiProperty({ example: 75.5, description: 'En kg o lbs según unitSystem' })
  @IsNumber()
  @Min(30)
  @Max(300)
  weight: number;

  @ApiProperty({ example: 175, description: 'En cm o pulgadas' })
  @IsNumber()
  @Min(100)
  @Max(250)
  height: number;

  @ApiProperty({ enum: ActivityLevel })
  @IsEnum(ActivityLevel)
  activityLevel: ActivityLevel;

  @ApiProperty({ enum: UserGoal })
  @IsEnum(UserGoal)
  goal: UserGoal;

  @ApiProperty({ enum: UnitSystem, default: 'METRIC' })
  @IsOptional()
  @IsEnum(UnitSystem)
  unitSystem?: UnitSystem;

  @ApiProperty({ required: false, example: ['vegetarian'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryRestrictions?: string[];

  @ApiProperty({ required: false, example: ['lactose'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];
}
