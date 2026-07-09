import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SmsSyncService } from './sms-sync.service';
import { ParseSmsDto, ParseSmsBatchDto } from './dto/parse.dto';

@UseGuards(JwtAuthGuard)
@Controller('sms-sync')
export class SmsSyncController {
  constructor(private readonly smsSyncService: SmsSyncService) {}

  @Post('parse')
  parse(
    @CurrentUser() _user: { userId: string; email: string },
    @Body() dto: ParseSmsDto,
  ) {
    return this.smsSyncService.parse(dto.raw);
  }

  @Post('parse-batch')
  parseBatch(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: ParseSmsBatchDto,
  ) {
    return this.smsSyncService.parseBatch(user.userId, dto.messages);
  }
}
