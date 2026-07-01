import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { AccountType } from '../../common/enums';

export class CreateAccountDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  institutionName?: string;

  @IsOptional()
  @IsString()
  institutionLogo?: string;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInNetWorth?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;
}
