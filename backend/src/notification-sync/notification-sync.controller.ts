import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationSyncService } from './notification-sync.service';
import { IngestNotificationsDto } from './dto/ingest.dto';

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
}
