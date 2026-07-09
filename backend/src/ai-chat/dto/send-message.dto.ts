import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  /**
   * Client-generated per-turn id (not a UUID). On Retry the client reuses the
   * same id so the backend can dedupe the turn (replay/resume) instead of
   * logging a second action. Optional for backward compatibility.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMsgId?: string;
}
