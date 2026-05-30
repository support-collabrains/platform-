import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { LdapMetadataService } from '../ldap/ldap-metadata.service';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(
    private readonly service: UsersMeService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
    private readonly calendar: CalendarService,
    private readonly ldap: LdapMetadataService,
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

  @Get('document-types')
  async documentTypes(): Promise<object> {
    return { types: await this.service.getDocumentTypes() };
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
  async getTickets(
    @Headers('x-authentik-username') username: string,
    @Query('status') status?: string,
  ): Promise<object> {
    const ticketList = await this.tickets.getTicketsForUser(username, status);
    return { tickets: ticketList };
  }

  @Patch('tickets/:id')
  @HttpCode(200)
  async updateTicket(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
    @Body() body: { status: 'done' | 'open'; notes?: string },
  ): Promise<object> {
    const ok = await this.tickets.updateTicket(id, username, body.status, body.notes);
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

  @Get('calendar/events')
  async getCalendarEvents(
    @Headers('x-authentik-username') username: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<object> {
    const from = fromStr ? new Date(fromStr) : new Date();
    const to = toStr ? new Date(toStr) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const events = await this.calendar.getEvents(username, from, to);
    return { events };
  }

  @Post('calendar/events')
  @HttpCode(201)
  async createCalendarEvent(
    @Headers('x-authentik-username') username: string,
    @Body() body: { summary: string; start: string; end: string; location?: string; description?: string; allDay?: boolean },
  ): Promise<object> {
    const uid = await this.calendar.createEvent(username, {
      summary: body.summary,
      start: body.start,
      end: body.end,
      location: body.location,
      description: body.description,
      allDay: body.allDay ?? false,
    });
    await this.audit.log(username, 'calendar.event.create', uid, { summary: body.summary, start: body.start });
    return { uid };
  }

  @Patch('ldap-profile')
  @HttpCode(200)
  async updateLdapProfile(
    @Headers('x-authentik-username') username: string,
    @Body() body: { signalPhone?: string; defaultArchivePath?: string },
  ) {
    const patch: Record<string, string> = {};
    if (body.signalPhone !== undefined) patch.signalPhone = body.signalPhone;
    if (body.defaultArchivePath !== undefined) patch.defaultArchivePath = body.defaultArchivePath;
    if (Object.keys(patch).length > 0) {
      await this.ldap.setAttributes(username, patch);
    }
    return this.ldap.getAttributes(username);
  }

  @Get('ldap-profile')
  async getLdapProfile(@Headers('x-authentik-username') username: string) {
    return this.ldap.getAttributes(username);
  }
}
