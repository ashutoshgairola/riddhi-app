import {
  IsEmail,
  IsString,
  Length,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  // The 6-digit numeric code emailed by forgot-password.
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
