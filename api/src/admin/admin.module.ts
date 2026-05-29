import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LdapModule } from '../ldap/ldap.module';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { RolesGuard } from '../common/roles.guard';

@Module({
  imports: [UsersModule, AuditModule, TicketsModule, NotificationsModule, LdapModule],
  controllers: [AdminController],
  providers: [AdminService, InternalSecretGuard, RolesGuard],
})
export class AdminModule {}
