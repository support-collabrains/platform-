import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalTicket } from './ticket.entity';
import { TicketsService } from './tickets.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([SignalTicket]), AuditModule],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
