import { IsUUID, IsPositive } from 'class-validator';

export class PayCardDto {
  @IsUUID()
  fromAccountId: string;

  @IsPositive()
  amount: number;
}
