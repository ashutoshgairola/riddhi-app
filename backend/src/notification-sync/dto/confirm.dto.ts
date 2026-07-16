import { IsString, IsOptional, IsUUID, IsEnum, IsPositive, IsDateString } from 'class-validator';
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
}
