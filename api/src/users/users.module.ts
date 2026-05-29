import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PaperlessService } from './paperless.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LdapModule } from '../ldap/ldap.module';

@Module({
  imports: [NotificationsModule, LdapModule],
  controllers: [UsersController],
  providers: [UsersService, PaperlessService],
  exports: [UsersService],
})
export class UsersModule {}
