import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { ArchiveService } from '../documents/archive.service';
import { PushService } from '../notifications/push.service';
import type { WebPushSubscription } from '../notifications/push.service';
import { MobileconfigService } from '../mobileconfig/mobileconfig.service';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(
    private readonly service: UsersMeService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
    private readonly calendar: CalendarService,
    private readonly archive: ArchiveService,
    private readonly push: PushService,
    private readonly mobileconfig: MobileconfigService,
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

  @Get('tree')
  async getTree(@Headers('x-authentik-username') username: string): Promise<object> {
    const tree = await this.archive.getTree(username);
    return { tree };
  }

  @Get('push/vapid-key')
  getPushKey(): object {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('push/subscribe')
  @HttpCode(200)
  async pushSubscribe(
    @Headers('x-authentik-username') username: string,
    @Body() sub: WebPushSubscription,
  ): Promise<object> {
    await this.push.subscribe(username, sub);
    return { ok: true };
  }

  @Delete('push/subscribe')
  @HttpCode(200)
  async pushUnsubscribe(
    @Headers('x-authentik-username') username: string,
    @Body() body: { endpoint: string },
  ): Promise<object> {
    await this.push.unsubscribe(username, body.endpoint);
    return { ok: true };
  }

  @Get('mobileconfig/token')
  getMobileconfigToken(@Headers('x-authentik-username') username: string): object {
    const token = this.mobileconfig.generateToken(username);
    return { token };
  }

  @Get('mobileconfig')
  async getMobileconfig(
    @Headers('x-authentik-username') username: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.service.resolveUser(username);
    const mailPassword = (user.attributes as Record<string, string>)?.mail_imap_password ?? '';
    const plist = this.mobileconfig.buildPlist({
      username: user.username,
      email: user.email,
      name: user.name,
      mailPassword,
    });
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', `attachment; filename="collabrains-${user.username}.mobileconfig"`);
    res.send(plist);
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
}
