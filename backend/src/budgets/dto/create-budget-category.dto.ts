import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateBudgetCategoryDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNumber()
  allocated: number;

  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  rollover?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
