import {
  IsString, IsNumber, IsOptional, IsInt, MaxLength, Min, Matches,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsInt() @Min(0) guests?: number;
}
