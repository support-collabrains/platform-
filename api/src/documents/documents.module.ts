import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocDocument, DocNotification, DocSummary } from './document.entity';
import { OllamaService } from './ollama.service';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocDocument, DocNotification, DocSummary]),
    NotificationsModule,
    TicketsModule,
  ],
  providers: [OllamaService, DocumentsService],
  controllers: [DocumentsController],
  exports: [OllamaService],
})
export class DocumentsModule {}
