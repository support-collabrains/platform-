import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PaperlessService } from './paperless.service';
import { NotificationsService } from '../notifications/notifications.service';

const POLL_INTERVAL_MS = 60_000;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly paperlessService: PaperlessService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Run once at startup, then every minute
    setTimeout(() => this.pollForNewUsers(), 10_000);
    setInterval(() => this.pollForNewUsers(), POLL_INTERVAL_MS);
  }

  private async pollForNewUsers(): Promise<void> {
    const url = this.config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    const token = this.config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    const base = this.config.get('PAPERLESS_DATA_DIR') ?? '/data/paperless';

    try {
      const { data } = await axios.get(`${url}/api/v3/core/users/`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { type: 'internal', page_size: 100 },
      });

      for (const user of data.results as Array<{ pk: number; username: string; type: string }>) {
        if (user.username === 'AnonymousUser') continue;
        const consumeDir = path.join(base, 'consume', user.username);
        if (!fs.existsSync(consumeDir)) {
          this.logger.log(`Detected new user without consume dir: ${user.username}`);
          await this.onboardUser(user.pk);
        }
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      if (axiosErr?.response) {
        this.logger.warn(`User poll failed: HTTP ${axiosErr.response.status} — ${JSON.stringify(axiosErr.response.data)}`);
      } else {
        this.logger.warn(`User poll failed: ${axiosErr?.message ?? String(err)}`);
      }
    }
  }

  async onboardUser(authentikPk: number): Promise<void> {
    const user = await this.fetchAuthentikUser(authentikPk);
    if (!user) return;

    if (user.type !== 'internal') {
      this.logger.log(`Skipping non-internal user: ${user.username}`);
      return;
    }

    this.logger.log(`Onboarding user: ${user.username}`);

    this.createUserDirs(user.username);

    await this.paperlessService.ensureUserAndWorkflow(
      user.username,
      user.email,
      user.name,
    );

    const mailDomain = this.config.get('MAIL_DOMAIN') ?? '';
    if (mailDomain && user.email.endsWith(`@${mailDomain}`)) {
      await this.createMailcowMailbox(user.email, user.name);
    }

    // Notify admin + all users with phone numbers
    await this.notifications.broadcast(
      `✅ Nieuwe gebruiker aangemaakt: ${user.username} (${user.email})`,
    );

    // Welcome message to the new user if they have a phone number
    const phone: string | undefined = (user.attributes as Record<string, string>)?.phone;
    if (phone?.startsWith('+')) {
      await this.notifications.sendToNumber(
        phone,
        `Welkom bij CollaBrains, ${user.name || user.username}! 👋\nJe account is klaar. Je ontvangt hierna notificaties via dit nummer.`,
      );
    }

    this.logger.log(`Onboarding complete: ${user.username}`);
  }

  private async fetchAuthentikUser(pk: number) {
    const url = this.config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    const token = this.config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
    try {
      const { data } = await axios.get(`${url}/api/v3/core/users/${pk}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    } catch (err) {
      this.logger.error(`Could not fetch Authentik user pk=${pk}: ${(err as Error).message}`);
      return null;
    }
  }

  private createUserDirs(username: string): void {
    const base = this.config.get('PAPERLESS_DATA_DIR') ?? '/data/paperless';
    for (const subdir of ['consume', 'export']) {
      const dir = path.join(base, subdir, username);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        try {
          fs.chownSync(dir, 1000, 1000);
        } catch {
          // non-fatal: API may not run as root in some envs
        }
        this.logger.log(`Created dir: ${dir}`);
      }
    }
  }

  private async createMailcowMailbox(email: string, name: string): Promise<void> {
    const url = this.config.get('MAILCOW_URL') ?? 'http://nginx-mailcow:8080';
    const apiKey = this.config.get('MAILCOW_API_KEY') ?? '';
    if (!apiKey) return;

    const [local, domain] = email.split('@');
    const api = axios.create({ baseURL: url, headers: { 'X-API-Key': apiKey } });

    try {
      const { data: existing } = await api.get(`/api/v1/get/mailbox/${email}`);
      if (existing && !Array.isArray(existing)) {
        this.logger.log(`Mailbox already exists: ${email}`);
        return;
      }
      // Temporary password — users authenticate via SSO
      const tmp = `${Math.random().toString(36).slice(2)}Aa1!`;
      await api.post('/api/v1/add/mailbox', {
        local_part: local,
        domain,
        name,
        password: tmp,
        password2: tmp,
        quota: 3072,
        active: 1,
        force_pw_update: 0,
      });
      this.logger.log(`Created mailbox: ${email}`);
    } catch (err) {
      this.logger.error(`Failed to create mailbox ${email}: ${(err as Error).message}`);
    }
  }
}
