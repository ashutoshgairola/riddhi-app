import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsPositive,
  IsInt,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';
import {
  GoalType,
  GoalStatus,
  ContributionFrequency,
} from '../../common/enums';

export class CreateGoalDto {
  @IsString()
  name: string;

  @IsEnum(GoalType)
  type: GoalType;

  @IsPositive()
  targetAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentAmount?: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  targetDate: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsEnum(ContributionFrequency)
  contributionFrequency?: ContributionFrequency;

  @IsOptional()
  @IsPositive()
  contributionAmount?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
