import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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

  @IsOptional()
  @IsBoolean()
  hideBalances?: boolean;

  @IsOptional()
  @IsBoolean()
  biometricEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  budgetAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  goalMilestonesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  largeTxAlertsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  munshiSuggestionsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  monthlyReportEnabled?: boolean;
}
