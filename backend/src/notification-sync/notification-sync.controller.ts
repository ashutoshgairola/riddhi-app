import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationSyncService } from './notification-sync.service';
import { IngestNotificationsDto } from './dto/ingest.dto';
import { ConfirmDetectedDto } from './dto/confirm.dto';
import { UpdateVendorMappingDto } from './dto/update-vendor-mapping.dto';

@UseGuards(JwtAuthGuard)
@Controller('notification-sync')
export class NotificationSyncController {
  constructor(private readonly service: NotificationSyncService) {}

  @Get('catalog')
  catalog() {
    return this.service.getCatalog();
  }

  @Post('ingest')
  ingest(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: IngestNotificationsDto,
  ) {
    return this.service.ingest(user.userId, dto.notifications);
  }

  @Get('pending')
  pending(
    @CurrentUser() user: { userId: string },
    @Query('limit') limit?: string,
  ) {
    return this.service.listPending(user.userId, limit);
  }

  @Get('vendor-mappings')
  listVendorMappings(@CurrentUser() user: { userId: string }) {
    return this.service.listMappings(user.userId);
  }

  @Patch('vendor-mappings/:id')
  updateVendorMapping(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateVendorMappingDto,
  ) {
    return this.service.updateMapping(user.userId, id, dto);
  }

  @Delete('vendor-mappings/:id')
  deleteVendorMapping(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.service.deleteMapping(user.userId, id);
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

  @Post('analyze')
  analyze(@CurrentUser() user: { userId: string; email: string }) {
    return this.service.runAnalysisForUser(user.userId, { interactive: true });
  }
}
