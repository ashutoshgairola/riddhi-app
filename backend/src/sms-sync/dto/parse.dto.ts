import { IsString, IsNotEmpty } from 'class-validator';

export class ParseSmsDto {
  @IsString()
  @IsNotEmpty()
  raw: string;
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
