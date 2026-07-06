import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ParseSmsDto {
  @IsString()
  @IsNotEmpty()
  raw: string;
}

export class SmsMessageDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  raw: string;
}

export class ParseSmsBatchDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SmsMessageDto)
  messages: SmsMessageDto[];
}

export interface ParseSmsResult {
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: string | null;
  account: string | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
}
