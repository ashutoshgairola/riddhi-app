import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationSyncService } from './notification-sync.service';
import { IngestNotificationsDto } from './dto/ingest.dto';
import { ConfirmDetectedDto } from './dto/confirm.dto';

@UseGuards(JwtAuthGuard)
@Controller('notification-sync')
export class NotificationSyncController {
  constructor(private readonly service: NotificationSyncService) {}

  @Post('ingest')
  ingest(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: IngestNotificationsDto,
  ) {
    return this.service.ingest(user.userId, dto.notifications);
  }

  @Get('pending')
  pending(@CurrentUser() user: { userId: string }) {
    return this.service.listPending(user.userId);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: ConfirmDetectedDto,
  ) {
    return this.service.confirm(user.userId, id, dto);
  }

  @Post(':id/dismiss')
  dismiss(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.service.dismiss(user.userId, id);
  }
}
