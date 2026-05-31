import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocDocument, DocNotification } from '../documents/document.entity';
import { UsersMeService } from './users-me.service';
import { UsersMeController } from './users-me.controller';
import { InternalSecretGuard } from './internal-secret.guard';
import { TicketsModule } from '../tickets/tickets.module';
import { AuditModule } from '../audit/audit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { LdapModule } from '../ldap/ldap.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [TypeOrmModule.forFeature([DocDocument, DocNotification]), TicketsModule, AuditModule, CalendarModule, LdapModule, FinanceModule],
  providers: [UsersMeService, InternalSecretGuard],
  controllers: [UsersMeController],
})
export class UsersMeModule {}
