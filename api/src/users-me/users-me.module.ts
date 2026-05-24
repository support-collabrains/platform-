import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocDocument, DocNotification } from '../documents/document.entity';
import { UsersMeService } from './users-me.service';
import { UsersMeController } from './users-me.controller';
import { InternalSecretGuard } from './internal-secret.guard';

@Module({
  imports: [TypeOrmModule.forFeature([DocDocument, DocNotification])],
  providers: [UsersMeService, InternalSecretGuard],
  controllers: [UsersMeController],
})
export class UsersMeModule {}
