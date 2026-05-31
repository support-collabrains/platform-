import { Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InternalSecretGuard } from './internal-secret.guard';
import { UsersMeService, UserPreferences } from './users-me.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { CalendarService } from '../calendar/calendar.service';
import { LdapMetadataService } from '../ldap/ldap-metadata.service';
import { FinanceService } from '../finance/finance.service';
import { CreateTransactionDto, UpdateTransactionDto, CreateSubscriptionDto, UpdateSubscriptionDto } from '../finance/finance.dto';

@Controller('users/me')
@UseGuards(InternalSecretGuard)
export class UsersMeController {
  constructor(
    private readonly service: UsersMeService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
    private readonly calendar: CalendarService,
    private readonly ldap: LdapMetadataService,
    private readonly financeService: FinanceService,
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

  @Get('documents/:id')
  async getDocument(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
  ): Promise<object> {
    const user = await this.service.resolveUser(username);
    const doc = await this.service.getDocumentById(Number(id), user.username);
    if (!doc) throw new NotFoundException('Document niet gevonden of geen toegang');
    return doc;
  }

  @Get('documents/:id/preview')
  async previewDocument(
    @Headers('x-authentik-username') username: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = await this.service.resolveUser(username);
    const result = await this.service.getDocumentPreview(Number(id), user.username);
    if (!result) {
      res.status(404).json({ error: 'Document niet gevonden of geen toegang' });
      return;
    }
    const ct = result.headers['content-type'] ?? 'application/pdf';
    res.setHeader('content-type', String(ct));
    res.setHeader('content-disposition', 'inline');
    res.status(200).send(Buffer.from(result.data));
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

  // ── Finance ──────────────────────────────────────────────────────────────
  @Get('finance/summary')
  @UseGuards(InternalSecretGuard)
  getFinanceSummary(@Headers('x-authentik-username') owner: string) {
    return this.financeService.getSummary(owner);
  }

  @Get('finance/transactions')
  @UseGuards(InternalSecretGuard)
  getTransactions(
    @Headers('x-authentik-username') owner: string,
    @Query('status') status?: string,
    @Query('categorie') categorie?: string,
  ) {
    return this.financeService.getTransactions(owner, status, categorie);
  }

  @Post('finance/transactions')
  @UseGuards(InternalSecretGuard)
  createTransaction(@Headers('x-authentik-username') owner: string, @Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(owner, dto);
  }

  @Patch('finance/transactions/:id')
  @UseGuards(InternalSecretGuard)
  updateTransaction(@Headers('x-authentik-username') owner: string, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.financeService.updateTransaction(owner, id, dto);
  }

  @Delete('finance/transactions/:id')
  @UseGuards(InternalSecretGuard)
  deleteTransaction(@Headers('x-authentik-username') owner: string, @Param('id') id: string) {
    return this.financeService.deleteTransaction(owner, id);
  }

  @Get('finance/subscriptions')
  @UseGuards(InternalSecretGuard)
  getSubscriptions(@Headers('x-authentik-username') owner: string) {
    return this.financeService.getSubscriptions(owner);
  }

  @Post('finance/subscriptions')
  @UseGuards(InternalSecretGuard)
  createSubscription(@Headers('x-authentik-username') owner: string, @Body() dto: CreateSubscriptionDto) {
    return this.financeService.createSubscription(owner, dto);
  }

  @Patch('finance/subscriptions/:id')
  @UseGuards(InternalSecretGuard)
  updateSubscription(@Headers('x-authentik-username') owner: string, @Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.financeService.updateSubscription(owner, id, dto);
  }

  @Delete('finance/subscriptions/:id')
  @UseGuards(InternalSecretGuard)
  deleteSubscription(@Headers('x-authentik-username') owner: string, @Param('id') id: string) {
    return this.financeService.deleteSubscription(owner, id);
  }
}
