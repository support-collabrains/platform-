import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  async chat(
    @Headers('x-authentik-username') username: string,
    @Body() body: { messages: { role: string; content: string }[]; context?: string },
  ): Promise<{ reply: string; model: string }> {
    return this.ai.chat(username ?? 'unknown', body.messages ?? [], body.context);
  }

  @Post('chat/stream')
  async chatStream(
    @Headers('x-authentik-username') username: string,
    @Body() body: { messages: { role: string; content: string }[]; context?: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.ai.chatStream(username ?? 'unknown', body.messages ?? [], body.context, res);
  }

  @Get('models')
  async getModels(): Promise<{ models: string[] }> {
    const models = await this.ai.getModels();
    return { models };
  }

  @Post('summarize')
  async summarize(
    @Body() body: { text: string },
  ): Promise<{ summary: string }> {
    const summary = await this.ai.summarizeText(body.text ?? '');
    return { summary };
  }
}
