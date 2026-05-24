import { Controller, Post, Body, Query, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';

interface AuthentikWebhookPayload {
  event?: {
    action?: string;
    context?: {
      model?: {
        pk?: number;
        model_name?: string;
      };
    };
  };
}

@Controller('webhook')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Post('authentik')
  handleAuthentikWebhook(
    @Query('token') token: string,
    @Body() payload: AuthentikWebhookPayload,
  ) {
    const secret = this.config.get<string>('AUTHENTIK_WEBHOOK_SECRET');
    if (secret && token !== secret) {
      throw new UnauthorizedException();
    }

    const event = payload?.event;
    if (
      event?.action === 'model_created' &&
      event?.context?.model?.model_name === 'user' &&
      event?.context?.model?.pk
    ) {
      const pk = event.context.model.pk;
      this.logger.log(`Authentik user created event: pk=${pk}`);
      this.usersService.onboardUser(pk).catch((err: Error) => {
        this.logger.error(`Onboarding failed for pk=${pk}: ${err.message}`);
      });
    }

    return { ok: true };
  }
}
