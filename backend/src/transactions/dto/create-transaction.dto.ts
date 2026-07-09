import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  IsPositive,
  IsDateString,
  ValidateNested,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType, TransactionStatus, PaymentMethod } from '../../common/enums';

class RecurringDetailsDto {
  @IsIn(['daily', 'weekly', 'monthly', 'yearly'])
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsInt()
  @Min(1)
  interval: number;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsDateString()
  nextDate?: string | null;
}

export class CreateTransactionDto {
  @IsDateString()
  date: string;

  @IsString()
  description: string;

  @IsPositive()
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  /** Links this transaction to an Event Planner expense (set server-side). */
  @IsOptional()
  @IsUUID()
  eventId?: string;

  /** Destination account for a `transfer` — credited when the source is debited. */
  @IsOptional()
  @IsUUID()
  destinationAccountId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringDetailsDto)
  recurringDetails?: RecurringDetailsDto;

  /** Statement-import dedup fingerprint (set server-side by StatementsService). */
  @IsOptional()
  @IsString()
  importFingerprint?: string;
}
