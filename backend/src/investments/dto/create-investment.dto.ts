import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsPositive,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { AssetClass, InvestmentType } from '../../common/enums';

export class CreateInvestmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  ticker?: string;

  @IsEnum(AssetClass)
  assetClass: AssetClass;

  @IsEnum(InvestmentType)
  type: InvestmentType;

  @IsPositive()
  shares: number;

  @IsNumber()
  purchasePrice: number;

  @IsNumber()
  currentPrice: number;

  @IsDateString()
  purchaseDate: string;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsNumber()
  dividendYield?: number;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
