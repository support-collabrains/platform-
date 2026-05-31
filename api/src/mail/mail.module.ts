import { Module } from '@nestjs/common';
import { MailImapService } from './mail-imap.service';
import { MailController } from './mail.controller';

@Module({
  providers: [MailImapService],
  controllers: [MailController],
  exports: [MailImapService],
})
export class MailModule {}
