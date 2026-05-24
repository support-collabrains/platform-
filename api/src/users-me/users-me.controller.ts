import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';
import { TicketsService } from '../tickets/tickets.service';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(
    private readonly service: UsersMeService,
    private readonly tickets: TicketsService,
  ) {}

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

  @Get('tickets')
  async getTickets(@Headers('x-authentik-uid') uid: string): Promise<object> {
    const user = await this.service.resolveUser(uid);
    const ticketList = await this.tickets.getTicketsForUser(user.username);
    return { tickets: ticketList };
  }

  @Patch('tickets/:id')
  @HttpCode(200)
  async updateTicket(
    @Headers('x-authentik-uid') uid: string,
    @Param('id') id: string,
    @Body() body: { status: 'done' | 'open' },
  ): Promise<object> {
    const user = await this.service.resolveUser(uid);
    const ok = await this.tickets.updateTicket(id, user.username, body.status);
    return { ok };
  }

  @Delete('tickets/:id')
  @HttpCode(200)
  async deleteTicket(
    @Headers('x-authentik-uid') uid: string,
    @Param('id') id: string,
  ): Promise<object> {
    const user = await this.service.resolveUser(uid);
    const ok = await this.tickets.deleteTicket(id, user.username);
    return { ok };
  }
}
