import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const MAX_LEN = 20 * 1024 * 1024; // ~15MB base64 PDF or extracted text

export class ParseStatementDto {
  /** Base64 PDF bytes (no data: URI prefix) — present when the PDF is
   * unencrypted. Exactly one of pdf/text is sent. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEN)
  pdf?: string;

  /** Statement text extracted on-device from an encrypted PDF (password never
   * leaves the phone). Exactly one of pdf/text is sent. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEN)
  text?: string;

  /** Target account when launched from CardDetail / AccountDetail (implicit). */
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
