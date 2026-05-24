import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalTicket } from './ticket.entity';
import { TicketsService } from './tickets.service';

@Module({
  imports: [TypeOrmModule.forFeature([SignalTicket])],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
