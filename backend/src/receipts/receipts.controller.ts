import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceiptsService } from './receipts.service';
import { ScanReceiptDto } from './dto/scan-receipt.dto';

@UseGuards(JwtAuthGuard)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('scan')
  scan(@Body() dto: ScanReceiptDto) {
    return this.receiptsService.scan(dto.image, dto.mimeType);
  }
}
