import { Body, Controller, Get, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { PushService } from './push.service';

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Controller('push')
@UseGuards(InternalSecretGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-key')
  getVapidKey() {
    return { publicKey: this.push.getVapidPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(201)
  async subscribe(
    @Headers('x-authentik-username') username: string,
    @Body() body: SubscribeBody,
  ) {
    await this.push.saveSubscription(username, body);
    return { ok: true };
  }
}
