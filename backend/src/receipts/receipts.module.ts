import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService, RECEIPTS_ANTHROPIC_CLIENT } from './receipts.service';

@Module({
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    {
      provide: RECEIPTS_ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
})
export class ReceiptsModule {}
