import {
  IsEnum,
  IsOptional,
  IsNumber,
  IsPositive,
  IsDateString,
  IsString,
} from 'class-validator';
import { InvestmentTransactionType } from '../../common/enums';

export class CreateInvestmentTransactionDto {
  @IsEnum(InvestmentTransactionType)
  type: InvestmentTransactionType;

  @IsOptional()
  @IsNumber()
  shares?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsNumber()
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
