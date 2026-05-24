import { Body, Controller, Get, Headers, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(private readonly service: UsersMeService) {}

  @Get('documents')
  async documents(@Headers('x-authentik-uid') uid: string): Promise<object> {
    const user = await this.service.resolveUser(uid);
    return { docs: await this.service.getDocuments(user.username) };
  }

  @Get('notifications')
  async notifications(@Headers('x-authentik-uid') uid: string): Promise<object> {
    const user = await this.service.resolveUser(uid);
    const phones = this.service.getPhonesFromAttributes(user.attributes);
    return { notifications: await this.service.getNotifications(phones) };
  }

  @Get('preferences')
  async getPreferences(@Headers('x-authentik-uid') uid: string) {
    const user = await this.service.resolveUser(uid);
    return this.service.parsePreferences(user.attributes);
  }

  @Patch('preferences')
  @HttpCode(200)
  async updatePreferences(
    @Headers('x-authentik-uid') uid: string,
    @Body() body: Partial<UserPreferences>,
  ) {
    await this.service.updatePreferences(uid, body);
    const user = await this.service.resolveUser(uid);
    return this.service.parsePreferences(user.attributes);
  }
}
