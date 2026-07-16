import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global so any feature (auth password reset today; others later) can inject
 * MailService without re-importing the module.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
