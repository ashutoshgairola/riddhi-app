import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '../common/enums';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto/register-device.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { userId: string; email: string },
    @Query('type') type?: NotificationType,
    @Query('read') read?: string,
  ) {
    const filters: { type?: NotificationType; read?: boolean } = {};
    if (type) filters.type = type;
    if (read !== undefined) filters.read = read === 'true';
    return this.notificationsService.findAll(user.userId, filters);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: { userId: string; email: string }) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Post(':id/read')
  markRead(
    @CurrentUser() user: { userId: string; email: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(id, user.userId);
  }

  @Post('register-device')
  registerDevice(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notificationsService.registerDevice(
      user.userId,
      dto.expoPushToken,
      dto.platform,
    );
  }

  @Post('unregister-device')
  unregisterDevice(@Body() dto: UnregisterDeviceDto) {
    return this.notificationsService.unregisterDevice(dto.expoPushToken);
  }
}
