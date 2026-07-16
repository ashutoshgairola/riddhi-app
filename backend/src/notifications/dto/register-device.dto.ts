import { IsIn, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(255)
  expoPushToken: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}

export class UnregisterDeviceDto {
  @IsString()
  @MaxLength(255)
  expoPushToken: string;
}
