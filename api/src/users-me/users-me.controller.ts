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
    @Headers('x-authentik-uid') uid: string,
    @Headers('x-authentik-groups') groups: string,
  ) {
    return this.service.getProfile(uid, groups ?? '');
  }

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
    const user = await this.service.resolveUser(uid);
    await this.service.updatePreferences(uid, body);
    await this.audit.log(user.username, 'prefs.update', undefined, body as Record<string, unknown>);
    return this.service.parsePreferences((await this.service.resolveUser(uid)).attributes);
  }

  @Get('audit')
  async getAudit(@Headers('x-authentik-uid') uid: string): Promise<object> {
    const user = await this.service.resolveUser(uid);
    const events = await this.audit.getForUser(user.username);
    return { events };
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
    if (ok && body.status === 'done') {
      await this.audit.log(user.username, 'ticket.done', id);
    }
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
