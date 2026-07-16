import { IsIn, IsString, IsNotEmpty, MaxLength } from 'class-validator';

const MAX_BASE64_LEN = 8 * 1024 * 1024; // ~6MB decoded — plenty for a photo

export class ScanReceiptDto {
  /** Base64-encoded image data (no data: URI prefix). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BASE64_LEN)
  image: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ScannedReceipt {
  amount: number | null;
  merchant: string | null;
  /** ISO date (YYYY-MM-DD) or null when not legible. */
  date: string | null;
  type: 'income' | 'expense';
  category: string | null;
}
