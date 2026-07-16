import { IsString, IsNumber, IsUUID, IsOptional, IsBoolean, IsInt, MaxLength, Min, ValidateIf, Matches } from 'class-validator';

export class CreateEventExpenseDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(255)
  label: string;

  /** YYYY-MM-DD within the event range, or null for Unscheduled. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dayDate?: string | null;

  @IsNumber()
  @Min(0)
  planned: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actual?: number;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
