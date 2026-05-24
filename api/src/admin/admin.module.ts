import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { RolesGuard } from '../common/roles.guard';

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, InternalSecretGuard, RolesGuard],
})
export class AdminModule {}
