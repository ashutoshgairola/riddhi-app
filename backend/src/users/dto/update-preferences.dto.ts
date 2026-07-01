import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Theme, StartOfWeek } from '../../common/enums';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  dateFormat?: string;

  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @IsOptional()
  @IsEnum(StartOfWeek)
  startOfWeek?: StartOfWeek;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}
