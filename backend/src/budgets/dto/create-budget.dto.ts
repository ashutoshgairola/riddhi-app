import {
  IsString,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBudgetCategoryDto } from './create-budget-category.dto';

export class CreateBudgetDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  income: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetCategoryDto)
  categories: CreateBudgetCategoryDto[];
}
