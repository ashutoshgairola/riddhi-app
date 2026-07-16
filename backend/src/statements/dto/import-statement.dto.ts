import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class ImportLineDto {
  @IsString() isoDate: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsIn(['debit', 'credit']) direction: 'debit' | 'credit';
  @IsString() descriptor: string;
  /** Resolved/edited category NAME (server resolves to an id). */
  @IsOptional() @IsString() category?: string | null;
}

class CardOverrideDto {
  @IsOptional() @IsString() statementDate?: string;
  @IsOptional() @IsNumber() statementBilled?: number;
  @IsOptional() @IsNumber() statementMinDue?: number;
  @IsOptional() @IsString() statementDueDate?: string;
  @IsOptional() @IsNumber() statementRewards?: number;
}

export class ImportStatementDto {
  @IsUUID() accountId: string;
  @IsIn(['card', 'bank']) statementType: 'card' | 'bank';

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportLineDto)
  items: ImportLineDto[];

  /** Card override figures to apply (card statements only). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CardOverrideDto)
  summary?: CardOverrideDto;

  /** When present, set the account balance to this (bank reconcile, opt-in). */
  @IsOptional()
  @IsNumber()
  setBalance?: number;
}
