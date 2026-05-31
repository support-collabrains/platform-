import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProactiveHint } from './proactive-hint.entity';
import { ProactiveService } from './proactive.service';
import { ProactiveController } from './proactive.controller';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { CalendarModule } from '../calendar/calendar.module';
import { PushModule } from '../push/push.module';
import { SignalTicket } from '../tickets/ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProactiveHint, SignalTicket]),
    DocumentsModule,
    MailModule,
    CalendarModule,
    PushModule,
  ],
  providers: [ProactiveService],
  controllers: [ProactiveController],
  exports: [ProactiveService],
})
export class ProactiveModule {}
