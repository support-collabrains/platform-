import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import * as dns from 'dns/promises';
import * as net from 'net';

import { BootstrapState } from '../common/bootstrap-state.enum';
import { AuthentikService } from './integrations/authentik.service';
import { MailcowService } from './integrations/mailcow.service';
import { TraefikService } from './integrations/traefik.service';
import { StartBootstrapDto } from './dto/start-bootstrap.dto';
import { OnboardingEvent } from './onboarding-event.entity';

export interface BootstrapEvent {
  state: BootstrapState;
  step: string;
  message: string;
  timestamp: Date;
  error?: string;
}

export interface SystemConfig {
  primaryDomain: string;
  mailDomain: string;
  adminEmail: string;
  hostname: string;
  timezone: string;
}

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);
  private currentState: BootstrapState = BootstrapState.UNINITIALIZED;
  private systemConfig: SystemConfig | null = null;
  private readonly eventLog: BootstrapEvent[] = [];

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly authentikService: AuthentikService,
    private readonly mailcowService: MailcowService,
    private readonly traefikService: TraefikService,
    @InjectRepository(OnboardingEvent)
    private readonly eventRepo: Repository<OnboardingEvent>,
  ) {}

  async onModuleInit() {
    await this.restoreStateFromDb();
    this.logger.log(`System state: ${this.currentState}`);

    if (this.currentState === BootstrapState.UNINITIALIZED) {
      await this.maybeAutoStart();
    }
  }

  private async maybeAutoStart(): Promise<void> {
    const { PRIMARY_DOMAIN, MAIL_DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, TIMEZONE } = process.env;
    if (!PRIMARY_DOMAIN || !MAIL_DOMAIN || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      this.logger.log('Missing env vars for auto-start — waiting for manual setup');
      return;
    }
    this.logger.log('Auto-starting bootstrap from environment variables');
    await this.startBootstrap({
      primaryDomain: PRIMARY_DOMAIN,
      mailDomain: MAIL_DOMAIN,
      adminEmail: ADMIN_EMAIL,
      adminPassword: ADMIN_PASSWORD,
      hostname: PRIMARY_DOMAIN,
      timezone: TIMEZONE ?? 'UTC',
    });
  }

  private async restoreStateFromDb(): Promise<void> {
    try {
      const rows = await this.eventRepo.find({ order: { createdAt: 'ASC' } });
      for (const row of rows) {
        this.eventLog.push({
          state: row.state,
          step: row.step,
          message: row.message,
          timestamp: row.createdAt,
          ...(row.error ? { error: row.error } : {}),
        });
        this.currentState = row.state;
      }
      if (rows.length > 0) {
        this.logger.log(`Restored ${rows.length} events from DB, state=${this.currentState}`);
      }
      if (this.currentState === BootstrapState.READY && !this.systemConfig) {
        this.systemConfig = {
          primaryDomain: process.env.PRIMARY_DOMAIN ?? '',
          mailDomain: process.env.MAIL_DOMAIN ?? '',
          adminEmail: process.env.ADMIN_EMAIL ?? '',
          hostname: process.env.PRIMARY_DOMAIN ?? '',
          timezone: process.env.TIMEZONE ?? 'UTC',
        };
      }
    } catch (err) {
      this.logger.warn(`Could not restore state from DB: ${(err as Error).message}`);
    }
  }

  getState(): BootstrapState {
    return this.currentState;
  }

  getEventLog(): BootstrapEvent[] {
    return this.eventLog;
  }

  getConfig(): SystemConfig | null {
    return this.systemConfig;
  }

  isReady(): boolean {
    return this.currentState === BootstrapState.READY;
  }

  async startBootstrap(dto: StartBootstrapDto): Promise<void> {
    if (this.currentState !== BootstrapState.UNINITIALIZED) {
      throw new Error(`Cannot start bootstrap in state: ${this.currentState}`);
    }

    this.systemConfig = {
      primaryDomain: dto.primaryDomain,
      mailDomain: dto.mailDomain,
      adminEmail: dto.adminEmail,
      hostname: dto.hostname,
      timezone: dto.timezone,
    };

    this.runBootstrapPipeline(dto).catch((err) => {
      this.logger.error('Bootstrap pipeline failed', err);
      void this.emitEvent(this.currentState, 'error', `Fatal: ${(err as Error).message}`, (err as Error).message);
    });
  }

  private async runBootstrapPipeline(dto: StartBootstrapDto): Promise<void> {
    // ── DNS_CHECK ────────────────────────────────────────────────────────
    await this.transition(BootstrapState.DNS_CHECK);
    try {
      await this.verifyDNS(dto.primaryDomain, dto.mailDomain);
      await this.verifyPorts(dto.hostname);
    } catch (err) {
      // Non-fatal: DNS propagation can be slow; ports may not be reachable from within the container
      await this.emitEvent(
        BootstrapState.DNS_CHECK,
        'dns-warn',
        `DNS/port check warning (continuing): ${(err as Error).message}`,
      );
    }

    // ── CREATING_SECRETS ────────────────────────────────────────────────
    await this.transition(BootstrapState.CREATING_SECRETS);
    const secrets = this.generateSecrets();

    // ── AUTHENTIK_SETUP ─────────────────────────────────────────────────
    await this.transition(BootstrapState.AUTHENTIK_SETUP);
    // Use the pre-configured bootstrap token from env (must match AUTHENTIK_BOOTSTRAP_TOKEN the container started with)
    const authentikBootstrapToken =
      process.env.AUTHENTIK_BOOTSTRAP_TOKEN ?? secrets.authentikBootstrapToken;
    await this.authentikService.provision({
      baseUrl: process.env.AUTHENTIK_URL ?? `http://authentik-server:9000`,
      bootstrapToken: authentikBootstrapToken,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      primaryDomain: dto.primaryDomain,
      oauthClientId: secrets.oauthClientId,
      oauthClientSecret: secrets.oauthClientSecret,
    });
    await this.emitEvent(BootstrapState.AUTHENTIK_SETUP, 'authentik', 'Authentik provisioned successfully');

    // ── MAILCOW_SETUP ────────────────────────────────────────────────────
    await this.transition(BootstrapState.MAILCOW_SETUP);
    const mailcowApiKey = process.env.MAILCOW_API_KEY ?? secrets.mailcowApiKey;
    const { dkim } = await this.mailcowService.provision({
      baseUrl: process.env.MAILCOW_URL ?? `http://nginx-mailcow`,
      apiKey: mailcowApiKey,
      mailDomain: dto.mailDomain,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
    });
    await this.emitEvent(BootstrapState.MAILCOW_SETUP, 'mailcow', `Mailcow provisioned. DKIM TXT: ${dkim}`);

    // ── TRAEFIK_CONFIG ───────────────────────────────────────────────────
    await this.transition(BootstrapState.TRAEFIK_CONFIG);
    await this.traefikService.provision({
      primaryDomain: dto.primaryDomain,
      mailDomain: dto.mailDomain,
      adminEmail: dto.adminEmail,
      traefikConfigDir: process.env.TRAEFIK_CONFIG_DIR ?? '/etc/traefik',
    });
    await this.emitEvent(BootstrapState.TRAEFIK_CONFIG, 'traefik', 'Traefik routes configured');

    // ── READY ─────────────────────────────────────────────────────────────
    await this.transition(BootstrapState.READY);
    this.logger.log('Bootstrap complete — system is ACTIVE');
  }

  async verifyDNS(primaryDomain: string, mailDomain: string): Promise<void> {
    await this.emitEvent(BootstrapState.DNS_CHECK, 'dns', `Checking DNS for ${primaryDomain}...`);

    try {
      await dns.resolve4(primaryDomain);
    } catch {
      throw new Error(`DNS: A record not found for ${primaryDomain}.`);
    }

    try {
      await dns.resolveMx(mailDomain);
    } catch {
      throw new Error(`DNS: MX record not found for ${mailDomain}.`);
    }

    await this.emitEvent(BootstrapState.DNS_CHECK, 'dns', 'DNS records verified');
  }

  async verifyPorts(hostname: string): Promise<void> {
    await this.emitEvent(BootstrapState.DNS_CHECK, 'ports', `Checking ports on ${hostname}...`);

    for (const port of [80, 443]) {
      const open = await this.isPortOpen(hostname, port);
      if (!open) {
        throw new Error(`Port ${port} is not reachable on ${hostname}.`);
      }
    }

    await this.emitEvent(BootstrapState.DNS_CHECK, 'ports', 'Ports 80 and 443 are open');
  }

  private isPortOpen(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  }

  private generateSecrets() {
    const gen = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
    return {
      jwtSecret: gen(),
      authentikBootstrapToken: gen(64),
      dbPassword: gen(),
      oauthClientId: `platform-portal`,
      oauthClientSecret: gen(),
      mailcowApiKey: gen(24),
      encryptionKey: gen(32),
    };
  }

  private async transition(state: BootstrapState): Promise<void> {
    this.currentState = state;
    await this.emitEvent(state, 'transition', `Entered state: ${state}`);
    this.logger.log(`State → ${state}`);
  }

  private async emitEvent(state: BootstrapState, step: string, message: string, error?: string): Promise<void> {
    const event: BootstrapEvent = {
      state,
      step,
      message,
      timestamp: new Date(),
      ...(error && { error }),
    };
    this.eventLog.push(event);
    this.emitter.emit('bootstrap.event', event);
    await this.persistEvent(event);
  }

  private async persistEvent(event: BootstrapEvent): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          state: event.state,
          step: event.step,
          message: event.message,
          error: event.error ?? null,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to persist event to DB: ${(err as Error).message}`);
    }
  }
}
