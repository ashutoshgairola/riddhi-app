import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsPositive,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { TransactionType, PaymentMethod } from '../../common/enums';

export class ConfirmDetectedDto {
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

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;

  /** When true, upsert a vendor mapping from this confirmation and sweep the
   * pending queue for same-vendor detections. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
