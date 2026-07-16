import { IsPositive, IsUUID } from 'class-validator';

export class ContributeGoalDto {
  @IsPositive()
  amount: number;

  @IsUUID()
  sourceAccountId: string;
}
