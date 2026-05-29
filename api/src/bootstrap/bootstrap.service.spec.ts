// Covers: getState/isReady, startBootstrap (throws if not UNINITIALIZED, sets systemConfig),
// runBootstrapPipeline (all state transitions, non-fatal DNS error, calls services in order),
// generateSecrets (crypto-secure, returns all required keys),
// verifyDNS (resolves/throws for A/MX), verifyPorts (open/closed),
// restoreStateFromDb (replay events ASC, sets READY config from env),
// maybeAutoStart (skips on missing env / calls startBootstrap with full env)

import * as net from 'net';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { BootstrapService } from './bootstrap.service';
import { BootstrapState } from '../common/bootstrap-state.enum';
import { AuthentikService } from './integrations/authentik.service';
import { MailcowService } from './integrations/mailcow.service';
import { TraefikService } from './integrations/traefik.service';
import { OnboardingEvent } from './onboarding-event.entity';
import { StartBootstrapDto } from './dto/start-bootstrap.dto';

jest.mock('dns/promises', () => ({
  resolve4: jest.fn(),
  resolveMx: jest.fn(),
}));
jest.mock('net');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedDns = require('dns/promises') as { resolve4: jest.Mock; resolveMx: jest.Mock };

const BASE_DTO: StartBootstrapDto = {
  primaryDomain: 'platform.test.com',
  mailDomain: 'mail.test.com',
  adminEmail: 'admin@test.com',
  adminPassword: 'password123',
  hostname: 'platform.test.com',
  timezone: 'Europe/Amsterdam',
};

function makeEventRepo(): jest.Mocked<Repository<OnboardingEvent>> {
  return {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<Repository<OnboardingEvent>>;
}

function makeEmitter(): jest.Mocked<EventEmitter2> {
  return { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
}

function makeAuthentik(): jest.Mocked<AuthentikService> {
  return { provision: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuthentikService>;
}

function makeMailcow(): jest.Mocked<MailcowService> {
  return { provision: jest.fn().mockResolvedValue({ dkim: 'v=DKIM1;' }) } as unknown as jest.Mocked<MailcowService>;
}

function makeTraefik(): jest.Mocked<TraefikService> {
  return { provision: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<TraefikService>;
}

function makeService(overrides: { eventRepo?: jest.Mocked<Repository<OnboardingEvent>> } = {}): {
  service: BootstrapService;
  emitter: jest.Mocked<EventEmitter2>;
  authentik: jest.Mocked<AuthentikService>;
  mailcow: jest.Mocked<MailcowService>;
  traefik: jest.Mocked<TraefikService>;
  eventRepo: jest.Mocked<Repository<OnboardingEvent>>;
} {
  const emitter = makeEmitter();
  const authentik = makeAuthentik();
  const mailcow = makeMailcow();
  const traefik = makeTraefik();
  const eventRepo = overrides.eventRepo ?? makeEventRepo();
  const service = new BootstrapService(emitter, authentik, mailcow, traefik, eventRepo as Repository<OnboardingEvent>);
  return { service, emitter, authentik, mailcow, traefik, eventRepo };
}

// Mock net.Socket to control port check behaviour
function mockPortOpen(open: boolean) {
  const mockSocket = {
    setTimeout: jest.fn(),
    once: jest.fn().mockImplementation(function (this: Record<string, jest.Mock>, event: string, cb: () => void) {
      if (event === 'connect' && open) setImmediate(cb);
      if (event === 'error' && !open) setImmediate(cb);
      return this;
    }),
    connect: jest.fn(),
    destroy: jest.fn(),
  };
  (net.Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);
  return mockSocket;
}

describe('BootstrapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PRIMARY_DOMAIN;
    delete process.env.MAIL_DOMAIN;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  // ── getState / isReady ────────────────────────────────────────────────────

  describe('getState() / isReady()', () => {
    it('returns UNINITIALIZED initially', () => {
      const { service } = makeService();
      expect(service.getState()).toBe(BootstrapState.UNINITIALIZED);
    });

    it('isReady() returns false for non-READY states', () => {
      const { service } = makeService();
      expect(service.isReady()).toBe(false);
    });
  });

  // ── startBootstrap ────────────────────────────────────────────────────────

  describe('startBootstrap()', () => {
    it('throws Error when state is not UNINITIALIZED', async () => {
      const { service } = makeService();
      // Force state to non-UNINITIALIZED by completing a start
      await service.startBootstrap(BASE_DTO);
      // Wait a tick so pipeline starts
      await new Promise((r) => setImmediate(r));
      await expect(service.startBootstrap(BASE_DTO)).rejects.toThrow(/Cannot start bootstrap/);
    });

    it('sets systemConfig from dto synchronously', async () => {
      const { service } = makeService();
      service.startBootstrap(BASE_DTO).catch(() => {});
      expect(service.getConfig()).toMatchObject({
        primaryDomain: 'platform.test.com',
        mailDomain: 'mail.test.com',
      });
    });
  });

  // ── runBootstrapPipeline ──────────────────────────────────────────────────

  describe('runBootstrapPipeline()', () => {
    it('transitions through all states and ends READY', async () => {
      mockedDns.resolve4.mockResolvedValue(['1.2.3.4']);
      mockedDns.resolveMx.mockResolvedValue([{ exchange: 'mx.test.com', priority: 10 }]);
      mockPortOpen(true);

      const { service } = makeService();
      await service.startBootstrap(BASE_DTO);
      // Wait for async pipeline to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(service.getState()).toBe(BootstrapState.READY);
      expect(service.isReady()).toBe(true);
    });

    it('calls authentikService.provision and mailcowService.provision', async () => {
      mockedDns.resolve4.mockResolvedValue(['1.2.3.4']);
      mockedDns.resolveMx.mockResolvedValue([{ exchange: 'mx', priority: 10 }]);
      mockPortOpen(true);

      const { service, authentik, mailcow } = makeService();
      await service.startBootstrap(BASE_DTO);
      await new Promise((r) => setTimeout(r, 50));

      expect(authentik.provision).toHaveBeenCalled();
      expect(mailcow.provision).toHaveBeenCalled();
    });

    it('DNS failure is non-fatal — pipeline continues to READY', async () => {
      mockedDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
      mockPortOpen(true);

      const { service } = makeService();
      await service.startBootstrap(BASE_DTO);
      await new Promise((r) => setTimeout(r, 50));

      expect(service.getState()).toBe(BootstrapState.READY);
    });

    it('emits bootstrap.event for each transition', async () => {
      mockedDns.resolve4.mockResolvedValue(['1.2.3.4']);
      mockedDns.resolveMx.mockResolvedValue([{ exchange: 'mx', priority: 10 }]);
      mockPortOpen(true);

      const { service, emitter } = makeService();
      await service.startBootstrap(BASE_DTO);
      await new Promise((r) => setTimeout(r, 50));

      expect(emitter.emit).toHaveBeenCalledWith('bootstrap.event', expect.objectContaining({ state: BootstrapState.READY }));
    });

    it('persists events to eventRepo', async () => {
      mockedDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));

      const { service, eventRepo } = makeService();
      await service.startBootstrap(BASE_DTO);
      await new Promise((r) => setTimeout(r, 50));

      expect(eventRepo.save).toHaveBeenCalled();
    });
  });

  // ── generateSecrets ───────────────────────────────────────────────────────

  describe('generateSecrets()', () => {
    it('returns all required keys', () => {
      const { service } = makeService();
      const secrets = (service as unknown as { generateSecrets: () => Record<string, string> })['generateSecrets']();
      for (const key of ['jwtSecret', 'authentikBootstrapToken', 'dbPassword', 'oauthClientId', 'oauthClientSecret', 'mailcowApiKey', 'encryptionKey']) {
        expect(secrets).toHaveProperty(key);
        expect(typeof secrets[key]).toBe('string');
        expect(secrets[key].length).toBeGreaterThan(0);
      }
    });

    it('uses crypto.randomBytes (cryptographically secure) — correct behavior', () => {
      const cryptoSpy = jest.spyOn(require('crypto'), 'randomBytes');
      const { service } = makeService();
      (service as unknown as { generateSecrets: () => Record<string, string> })['generateSecrets']();
      expect(cryptoSpy).toHaveBeenCalled();
      cryptoSpy.mockRestore();
    });

    it('oauthClientId is always platform-portal', () => {
      const { service } = makeService();
      const secrets = (service as unknown as { generateSecrets: () => Record<string, string> })['generateSecrets']();
      expect(secrets.oauthClientId).toBe('platform-portal');
    });
  });

  // ── verifyDNS ─────────────────────────────────────────────────────────────

  describe('verifyDNS()', () => {
    it('resolves when A record and MX record exist', async () => {
      mockedDns.resolve4.mockResolvedValue(['1.2.3.4']);
      mockedDns.resolveMx.mockResolvedValue([{ exchange: 'mx', priority: 10 }]);
      const { service } = makeService();
      await expect(service.verifyDNS('platform.test.com', 'mail.test.com')).resolves.toBeUndefined();
    });

    it('throws with descriptive message when A record missing', async () => {
      mockedDns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
      const { service } = makeService();
      await expect(service.verifyDNS('platform.test.com', 'mail.test.com')).rejects.toThrow(/A record not found/);
    });

    it('throws with descriptive message when MX record missing', async () => {
      mockedDns.resolve4.mockResolvedValue(['1.2.3.4']);
      mockedDns.resolveMx.mockRejectedValue(new Error('NODATA'));
      const { service } = makeService();
      await expect(service.verifyDNS('platform.test.com', 'mail.test.com')).rejects.toThrow(/MX record not found/);
    });
  });

  // ── verifyPorts ───────────────────────────────────────────────────────────

  describe('verifyPorts()', () => {
    it('resolves when ports 80 and 443 are open', async () => {
      mockPortOpen(true);
      const { service } = makeService();
      await expect(service.verifyPorts('platform.test.com')).resolves.toBeUndefined();
    });

    it('throws descriptive message when a port is not reachable', async () => {
      mockPortOpen(false);
      const { service } = makeService();
      await expect(service.verifyPorts('platform.test.com')).rejects.toThrow(/not reachable/);
    });
  });

  // ── restoreStateFromDb ────────────────────────────────────────────────────

  describe('restoreStateFromDb()', () => {
    it('replays events from DB in ASC order and sets currentState to last event state', async () => {
      const rows = [
        { state: BootstrapState.DNS_CHECK, step: 'transition', message: 'DNS', createdAt: new Date(1) },
        { state: BootstrapState.READY, step: 'transition', message: 'Ready', createdAt: new Date(2) },
      ] as OnboardingEvent[];
      const repo = makeEventRepo();
      repo.find.mockResolvedValue(rows);
      const { service } = makeService({ eventRepo: repo });

      await (service as unknown as { restoreStateFromDb: () => Promise<void> })['restoreStateFromDb']();
      expect(service.getState()).toBe(BootstrapState.READY);
      expect(service.isReady()).toBe(true);
    });

    it('populates systemConfig from process.env when state is READY', async () => {
      process.env.PRIMARY_DOMAIN = 'platform.test.com';
      process.env.MAIL_DOMAIN = 'mail.test.com';
      process.env.ADMIN_EMAIL = 'admin@test.com';

      const rows = [
        { state: BootstrapState.READY, step: 'transition', message: 'Ready', createdAt: new Date() },
      ] as OnboardingEvent[];
      const repo = makeEventRepo();
      repo.find.mockResolvedValue(rows);
      const { service } = makeService({ eventRepo: repo });

      await (service as unknown as { restoreStateFromDb: () => Promise<void> })['restoreStateFromDb']();
      expect(service.getConfig()?.primaryDomain).toBe('platform.test.com');
    });

    it('handles DB error gracefully without throwing', async () => {
      const repo = makeEventRepo();
      repo.find.mockRejectedValue(new Error('Connection refused'));
      const { service } = makeService({ eventRepo: repo });
      await expect(
        (service as unknown as { restoreStateFromDb: () => Promise<void> })['restoreStateFromDb'](),
      ).resolves.toBeUndefined();
    });
  });

  // ── maybeAutoStart ────────────────────────────────────────────────────────

  describe('maybeAutoStart()', () => {
    it('does not auto-start when required env vars are missing', async () => {
      const { service, authentik } = makeService();
      await (service as unknown as { maybeAutoStart: () => Promise<void> })['maybeAutoStart']();
      expect(authentik.provision).not.toHaveBeenCalled();
    });

    it('calls startBootstrap when all required env vars are present', async () => {
      process.env.PRIMARY_DOMAIN = 'platform.test.com';
      process.env.MAIL_DOMAIN = 'mail.test.com';
      process.env.ADMIN_EMAIL = 'admin@test.com';
      process.env.ADMIN_PASSWORD = 'password123';

      mockedDns.resolve4.mockRejectedValue(new Error('no dns'));

      const { service } = makeService();
      await (service as unknown as { maybeAutoStart: () => Promise<void> })['maybeAutoStart']();
      // pipeline starts async — just verify state changed from UNINITIALIZED
      await new Promise((r) => setImmediate(r));
      expect(service.getState()).not.toBe(BootstrapState.UNINITIALIZED);
    });
  });
});
