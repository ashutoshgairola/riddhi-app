import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FirstGoalDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNumber()
  @Min(1)
  targetAmount: number;
}

export class CompleteOnboardingDto {
  @IsArray()
  @IsString({ each: true })
  focusGoals: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedBanks?: string[];

  @IsBoolean()
  smsSyncEnabled: boolean;

  @IsBoolean()
  biometricEnabled: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => FirstGoalDto)
  firstGoal?: FirstGoalDto;
}
