import { IsIn, IsOptional } from 'class-validator';

export type PeriodKey = '1m' | '3m' | '6m' | '1y';

export class PeriodDto {
  @IsOptional()
  @IsIn(['1m', '3m', '6m', '1y'])
  period?: PeriodKey;
}
