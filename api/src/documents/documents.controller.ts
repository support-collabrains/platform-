import { Body, Controller, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('consumed')
  async consumed(
    @Body() body: { documentId: number; owner: string; title: string },
  ): Promise<{ ok: boolean }> {
    await this.service.onConsumed(body.documentId, body.owner, body.title);
    return { ok: true };
  }

  @Post('signal-command')
  async signalCommand(
    @Body() body: { sender: string; text: string; timestamp?: number },
  ): Promise<{ ok: boolean }> {
    await this.service.handleSignalCommand(body.sender, body.text, body.timestamp);
    return { ok: true };
  }
}
