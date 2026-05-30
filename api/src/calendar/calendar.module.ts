import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  providers: [CalendarService, ContactsService],
  controllers: [ContactsController],
  exports: [CalendarService, ContactsService],
})
export class CalendarModule {}
