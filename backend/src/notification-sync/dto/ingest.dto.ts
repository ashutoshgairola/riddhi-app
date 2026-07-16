import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IngestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  packageName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;

  /** Epoch milliseconds the notification was posted. */
  @IsNumber()
  postedAt: number;
}

export class IngestNotificationsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestItemDto)
  notifications: IngestItemDto[];
}
