import { IsString, IsNumber, IsUUID, IsOptional, IsBoolean, IsInt, MaxLength, Min } from 'class-validator';

export class CreateEventExpenseDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(255)
  label: string;

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
