import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(
    private readonly service: UsersMeService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {}

  @Get('profile')
  async getProfile(
    @Headers('x-authentik-username') username: string,
    @Headers('x-authentik-groups') groups: string,
  ) {
    return this.service.getProfile(username, groups ?? '');
  }

  @Get('documents')
  async documents(@Headers('x-authentik-username') username: string): Promise<object> {
    const user = await this.service.resolveUser(username);
    return { docs: await this.service.getDocuments(user.username) };
  }

  @Get('notifications')
  async notifications(@Headers('x-authentik-username') username: string): Promise<object> {
    const user = await this.service.resolveUser(username);
    const phones = this.service.getPhonesFromAttributes(user.attributes);
    return { notifications: await this.service.getNotifications(phones) };
  }

  @Get('preferences')
  async getPreferences(@Headers('x-authentik-username') username: string) {
    const user = await this.service.resolveUser(username);
    return this.service.parsePreferences(user.attributes);
  }

  @Patch('preferences')
  @HttpCode(200)
  async updatePreferences(
    @Headers('x-authentik-username') username: string,
    @Body() body: Partial<UserPreferences>,
  ) {
    await this.service.updatePreferences(username, body);
    await this.audit.log(username, 'prefs.update', undefined, body as Record<string, unknown>);
    const user = await this.service.resolveUser(username);
    return this.service.parsePreferences(user.attributes);
  }

  @Get('audit')
  async getAudit(@Headers('x-authentik-username') username: string): Promise<object> {
    const events = await this.audit.getForUser(username);
    return { events };
  }

  @Get('tickets')
  async getTickets(@Headers('x-authentik-username') username: string): Promise<object> {
    const ticketList = await this.tickets.getTicketsForUser(username);
    return { tickets: ticketList };
  }

  @Patch('tickets/:id')
  @HttpCode(200)
  async updateTicket(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
    @Body() body: { status: 'done' | 'open' },
  ): Promise<object> {
    const ok = await this.tickets.updateTicket(id, username, body.status);
    if (ok && body.status === 'done') {
      await this.audit.log(username, 'ticket.done', id);
    }
    return { ok };
  }

  @Delete('tickets/:id')
  @HttpCode(200)
  async deleteTicket(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
  ): Promise<object> {
    const ok = await this.tickets.deleteTicket(id, username);
    return { ok };
  }
}
