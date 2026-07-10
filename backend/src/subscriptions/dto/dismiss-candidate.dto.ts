import { IsString, MaxLength } from 'class-validator';

export class DismissCandidateDto {
  @IsString() @MaxLength(200)
  merchantDescriptor: string;
}
