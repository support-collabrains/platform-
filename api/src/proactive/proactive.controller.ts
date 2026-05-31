import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Headers } from '@nestjs/common';
import { ProactiveService } from './proactive.service';
import { ProactiveHint } from './proactive-hint.entity';

@Controller('proactive')
export class ProactiveController {
  constructor(private readonly service: ProactiveService) {}

  @Get('hints')
  async getHints(
    @Headers('x-authentik-username') username: string,
  ): Promise<{ hints: ProactiveHint[] }> {
    const hints = await this.service.getHints(username);
    return { hints };
  }

  @Post('hints/:id/accept')
  async acceptHint(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
    @Body() body: { start?: string },
  ): Promise<{ ok: boolean }> {
    await this.service.acceptHint(username, id, body?.start);
    return { ok: true };
  }

  @Delete('hints/:id')
  async dismissHint(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
  ): Promise<{ ok: boolean }> {
    await this.service.dismissHint(username, id);
    return { ok: true };
  }

  @Post('scan')
  async triggerScan(
    @Headers('x-authentik-username') username: string,
  ): Promise<{ hints: ProactiveHint[] }> {
    const hints = await this.service.triggerScanForUser(username);
    return { hints };
  }
}
