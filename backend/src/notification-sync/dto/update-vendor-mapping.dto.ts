import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateVendorMappingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
