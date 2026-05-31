import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceTransaction, FinanceSubscription } from './finance.entity';
import { FinanceService } from './finance.service';
import { FinanceExtractorService } from './finance-extractor.service';
import { FinanceAlertService } from './finance-alert.service';
import { FinanceMailPollerService } from './finance-mail-poller.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FinanceTransaction, FinanceSubscription]),
    NotificationsModule,
    MailModule,
    DocumentsModule,
  ],
  providers: [FinanceService, FinanceExtractorService, FinanceAlertService, FinanceMailPollerService],
  exports: [FinanceService, FinanceAlertService],
})
export class FinanceModule {}
