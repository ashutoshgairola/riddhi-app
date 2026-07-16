import { IsString, IsOptional, IsNumber, IsInt, IsIn, IsArray, MaxLength, IsDateString, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString() @MaxLength(120)
  name: string;

  @IsString() @MaxLength(200)
  merchantDescriptor: string;

  @IsOptional() @IsString() @MaxLength(16)
  emoji?: string;

  @IsOptional() @IsString() @MaxLength(20)
  color?: string;

  @IsNumber() @Min(0)
  amount: number;

  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';

  @IsDateString()
  nextRenewalDate: string;

  @IsDateString()
  firstSeenDate: string;

  @IsOptional() @IsString()
  accountId?: string | null;

  @IsOptional() @IsString()
  paymentMethod?: string | null;

  @IsOptional() @IsString()
  categoryId?: string | null;

  @IsOptional() @IsInt() @Min(0)
  reminderDays?: number | null;

  /** Historical charge ids to back-link to this subscription. */
  @IsOptional() @IsArray()
  transactionIds?: string[];

  @IsOptional()
  @IsArray()
  priceHistory?: { amount: number; since: string }[];
}
