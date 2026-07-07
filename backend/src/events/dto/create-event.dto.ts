import {
  IsString, IsNumber, IsOptional, IsInt, IsArray, ValidateNested,
  MaxLength, Min, Matches, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEventExpenseDto } from './create-event-expense.dto';

export class CreateEventDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(16)
  emoji: string;

  @IsString()
  @MaxLength(32)
  color: string;

  /** YYYY-MM-DD or omitted. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsBoolean()
  multiDay?: boolean;

  /** YYYY-MM-DD; required by the service when multiDay is true. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsNumber()
  @Min(0)
  budget: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  guests?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventExpenseDto)
  expenses: CreateEventExpenseDto[];
}
