import { IsString, IsOptional, IsNumber, IsInt, IsIn, MaxLength, IsDateString, Min, IsBoolean } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsIn(['monthly', 'yearly'])
  cycle?: 'monthly' | 'yearly';

  @IsOptional() @IsIn(['active', 'paused', 'cancelled'])
  status?: 'active' | 'paused' | 'cancelled';

  @IsOptional() @IsDateString()
  nextRenewalDate?: string;

  @IsOptional() @IsString()
  accountId?: string | null;

  @IsOptional() @IsInt() @Min(0)
  reminderDays?: number | null;

  /** Set by the mobile detail sheet the first time it opens. */
  @IsOptional()
  @IsBoolean()
  markDetailOpened?: boolean;
}
