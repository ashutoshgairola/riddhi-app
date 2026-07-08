import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class UpdateCardDto {
  @IsOptional()
  @IsNumber()
  creditLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  statementDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  graceDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  network?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  last4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  rewardRate?: string;

  @IsOptional()
  @IsDateString()
  statementDate?: string;

  @IsOptional()
  @IsNumber()
  statementBilled?: number;

  @IsOptional()
  @IsNumber()
  statementMinDue?: number;

  @IsOptional()
  @IsDateString()
  statementDueDate?: string;

  @IsOptional()
  @IsNumber()
  statementRewards?: number;
}
