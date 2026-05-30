import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [DocumentsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
