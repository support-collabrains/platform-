import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingEvent } from './bootstrap/onboarding-event.entity';
import { DocDocument, DocNotification, DocSummary } from './documents/document.entity';
import { DocumentsModule } from './documents/documents.module';
import { UsersMeModule } from './users-me/users-me.module';
import { SignalTicket } from './tickets/ticket.entity';
import { TicketsModule } from './tickets/tickets.module';
import { AuditEvent } from './audit/audit.entity';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { CalendarModule } from './calendar/calendar.module';
import { LdapModule } from './ldap/ldap.module';
import { PushModule } from './push/push.module';
import { PushSubscription } from './push/push-subscription.entity';
import { GatewayModule } from './gateway/gateway.module';
import { AiModule } from './ai/ai.module';
import { ProactiveModule } from './proactive/proactive.module';
import { ProactiveHint } from './proactive/proactive-hint.entity';
import { FinanceTransaction, FinanceSubscription } from './finance/finance.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [OnboardingEvent, DocDocument, DocNotification, DocSummary, SignalTicket, AuditEvent, PushSubscription, ProactiveHint, FinanceTransaction, FinanceSubscription],
        synchronize: true,
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    LdapModule,
    BootstrapModule,
    UsersModule,
    AdminModule,
    NotificationsModule,
    DocumentsModule,
    UsersMeModule,
    TicketsModule,
    AuditModule,
    MailModule,
    CalendarModule,
    PushModule,
    GatewayModule,
    AiModule,
    ProactiveModule,
  ],
})
export class AppModule {}
