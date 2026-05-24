import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PaperlessService } from './paperless.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PaperlessService],
})
export class UsersModule {}
