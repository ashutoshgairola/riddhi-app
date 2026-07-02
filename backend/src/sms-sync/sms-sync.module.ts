import { Module } from '@nestjs/common';
import { SmsSyncController } from './sms-sync.controller';
import { SmsSyncService } from './sms-sync.service';

@Module({
  controllers: [SmsSyncController],
  providers: [SmsSyncService],
  exports: [SmsSyncService],
})
export class SmsSyncModule {}
