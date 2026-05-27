import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { TicketsService } from '../tickets/tickets.service';
import { RolesGuard } from '../common/roles.guard';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
  ) {}

  private authorizeWebhook(key: string | undefined) {
    const expected = this.config.get<string>('AUTHENTIK_WEBHOOK_SECRET');
    if (expected && key !== `Bearer ${expected}`) throw new UnauthorizedException();
  }

  // ── Service-to-service endpoints (webhook secret) ─────────────────────────

  @Post('users')
  async createUser(
    @Headers('authorization') auth: string,
    @Body() body: { username: string; name: string; email: string; password: string; phone?: string; phone2?: string },
  ) {
    this.authorizeWebhook(auth);
    const pk = await this.adminService.createUser(body.username, body.name, body.email, body.password, body.phone, body.phone2);
    await this.usersService.onboardUser(pk);
    await this.audit.log('system', 'user.create', body.username);
    return { ok: true, pk };
  }

  @Delete('users/:pk')
  @HttpCode(204)
  async deleteUser(@Headers('authorization') auth: string, @Param('pk') pk: string) {
    this.authorizeWebhook(auth);
    await this.adminService.deleteUser(Number(pk));
    await this.audit.log('system', 'user.delete', pk);
  }

  @Patch('apply-branding')
  async applyBranding(@Headers('authorization') auth: string) {
    this.authorizeWebhook(auth);
    await this.adminService.applyBranding();
    return { ok: true };
  }

  // ── User-facing admin endpoints (InternalSecretGuard + RolesGuard) ────────

  @Get('users')
  @UseGuards(InternalSecretGuard, RolesGuard)
  async listUsers() {
    return { users: await this.adminService.listUsers() };
  }

  @Patch('users/:pk/role')
  @HttpCode(200)
  @UseGuards(InternalSecretGuard, RolesGuard)
  async setRole(
    @Headers('x-authentik-username') actor: string,
    @Param('pk') pk: string,
    @Body() body: { role: 'admin' | 'user' },
  ) {
    await this.adminService.setRole(Number(pk), body.role);
    await this.audit.log(actor ?? 'admin', 'role.set', pk, { role: body.role });
    return { ok: true };
  }

  @Get('audit')
  @UseGuards(InternalSecretGuard, RolesGuard)
  async getAudit() {
    const events = await this.audit.getAll(100);
    return { events };
  }

  @Get('tickets')
  @UseGuards(InternalSecretGuard, RolesGuard)
  async listTickets() {
    const tickets = await this.tickets.listAll();
    return { tickets };
  }
}
