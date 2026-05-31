// Covers: listUsers (filter AnonymousUser, role from groups_obj, totpEnabled via pk set),
// setRole (use existing group / create group on demand, add_user / remove_user),
// createUser (with/without phone, sets language:nl, calls generateSetupLink),
// generateSetupLink (replaces internal hostname, returns '' on failure),
// deleteUser (calls DELETE), applyBranding (patch brand + stages, strip read-only),
// reprovisionAuthentik (delegates to AuthentikService.provision with full config)
//
// BUG DOCUMENTED: generateSetupLink at admin.service.ts:94 — naive regex replacement
//   rawLink.replace(/https?:\/\/[^/]+/, publicAuth) may fail behind multiple proxies.
//   Fix: const u = new URL(rawLink); u.host = new URL(publicAuth).host; return u.toString();
//
// BUG DOCUMENTED: deleteUser does NOT cascade — Mailcow mailbox and Paperless account
//   are NOT removed when an Authentik user is deleted (orphaned resources).

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AuthentikService } from '../bootstrap/integrations/authentik.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (k: string) => ({
      AUTHENTIK_URL: 'http://auth:9000',
      AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
      PRIMARY_DOMAIN: 'test.com',
      ...overrides,
    }[k] ?? ''),
  } as unknown as ConfigService;
}

function makeInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let instance: ReturnType<typeof makeInstance>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService(makeConfig());
    instance = makeInstance();
    mockedAxios.create.mockReturnValue(instance as ReturnType<typeof axios.create>);
  });

  // ── listUsers ─────────────────────────────────────────────────────────────

  describe('listUsers()', () => {
    function stubList(users: object[], totpResults: object[]) {
      instance.get
        .mockResolvedValueOnce({ data: { results: users } })      // users
        .mockResolvedValueOnce({ data: { results: totpResults } }); // totp
    }

    it('filters out AnonymousUser', async () => {
      stubList([
        { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', is_active: true, groups_obj: [] },
        { pk: 2, username: 'AnonymousUser', name: '', email: '', is_active: true, groups_obj: [] },
      ], []);
      const result = await service.listUsers();
      expect(result.map((u) => u.username)).not.toContain('AnonymousUser');
    });

    it('marks user as admin when groups_obj includes platform-admins', async () => {
      stubList([
        { pk: 1, username: 'alice', name: 'Alice', email: 'a@t.com', is_active: true, groups_obj: [{ name: 'platform-admins' }] },
      ], []);
      const [u] = await service.listUsers();
      expect(u.role).toBe('admin');
    });

    it('marks user as user when groups_obj does not include platform-admins', async () => {
      stubList([
        { pk: 1, username: 'bob', name: 'Bob', email: 'b@t.com', is_active: true, groups_obj: [] },
      ], []);
      const [u] = await service.listUsers();
      expect(u.role).toBe('user');
    });

    it('sets totpEnabled:true when user pk is in TOTP results', async () => {
      stubList([
        { pk: 5, username: 'alice', name: 'Alice', email: 'a@t.com', is_active: true, groups_obj: [] },
      ], [{ user: { pk: 5 } }]);
      const [u] = await service.listUsers();
      expect(u.totpEnabled).toBe(true);
    });

    it('sets totpEnabled:false when user pk not in TOTP results', async () => {
      stubList([
        { pk: 5, username: 'alice', name: 'Alice', email: 'a@t.com', is_active: true, groups_obj: [] },
      ], [{ user: { pk: 99 } }]);
      const [u] = await service.listUsers();
      expect(u.totpEnabled).toBe(false);
    });
  });

  // ── setRole ───────────────────────────────────────────────────────────────

  describe('setRole()', () => {
    it('uses existing group pk when platform-admins group exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { count: 1, results: [{ pk: 'grp-1' }] } });
      instance.post.mockResolvedValueOnce({ data: {} });
      await service.setRole(42, 'admin');
      expect(instance.post).toHaveBeenCalledWith('/api/v3/core/groups/grp-1/add_user/', { pk: 42 });
    });

    it('creates group when platform-admins does not exist', async () => {
      instance.get.mockResolvedValueOnce({ data: { count: 0, results: [] } });
      instance.post
        .mockResolvedValueOnce({ data: { pk: 'new-grp' } }) // create group
        .mockResolvedValueOnce({ data: {} });               // add_user
      await service.setRole(42, 'admin');
      expect(instance.post).toHaveBeenCalledWith('/api/v3/core/groups/', { name: 'platform-admins' });
    });

    it('calls add_user when role is admin', async () => {
      instance.get.mockResolvedValueOnce({ data: { count: 1, results: [{ pk: 'g1' }] } });
      instance.post.mockResolvedValueOnce({ data: {} });
      await service.setRole(7, 'admin');
      expect(instance.post.mock.calls[0][0]).toContain('add_user');
    });

    it('calls remove_user when role is user', async () => {
      instance.get.mockResolvedValueOnce({ data: { count: 1, results: [{ pk: 'g1' }] } });
      instance.post.mockResolvedValueOnce({ data: {} });
      await service.setRole(7, 'user');
      expect(instance.post.mock.calls[0][0]).toContain('remove_user');
    });
  });

  // ── createUser ────────────────────────────────────────────────────────────

  describe('createUser()', () => {
    it('creates user with language:nl attribute', async () => {
      instance.post
        .mockResolvedValueOnce({ data: { pk: 10 } }) // create user
        .mockResolvedValueOnce({ data: { link: 'http://auth:9000/recover/abc' } }); // recovery
      await service.createUser('alice', 'Alice', 'a@t.com');
      const attrs = (instance.post.mock.calls[0][1] as { attributes: Record<string, string> }).attributes;
      expect(attrs.language).toBe('nl');
    });

    it('includes phone in attributes when provided', async () => {
      instance.post
        .mockResolvedValueOnce({ data: { pk: 10 } })
        .mockResolvedValueOnce({ data: { link: 'http://auth:9000/recover/abc' } });
      await service.createUser('alice', 'Alice', 'a@t.com', '+31611');
      const attrs = (instance.post.mock.calls[0][1] as { attributes: Record<string, string> }).attributes;
      expect(attrs.phone).toBe('+31611');
    });

    it('omits phone from attributes when not provided', async () => {
      instance.post
        .mockResolvedValueOnce({ data: { pk: 10 } })
        .mockResolvedValueOnce({ data: { link: 'http://auth:9000/recover/abc' } });
      await service.createUser('alice', 'Alice', 'a@t.com');
      const attrs = (instance.post.mock.calls[0][1] as { attributes: Record<string, string> }).attributes;
      expect(attrs.phone).toBeUndefined();
    });

    it('calls generateSetupLink and returns { pk, setupLink }', async () => {
      instance.post
        .mockResolvedValueOnce({ data: { pk: 10 } })
        .mockResolvedValueOnce({ data: { link: 'http://auth:9000/recover/abc' } });
      const result = await service.createUser('alice', 'Alice', 'a@t.com');
      expect(result.pk).toBe(10);
      expect(result.setupLink).toContain('https://auth.test.com');
    });
  });

  // ── generateSetupLink ─────────────────────────────────────────────────────

  describe('generateSetupLink()', () => {
    it('replaces internal hostname with public auth URL', async () => {
      instance.post.mockResolvedValueOnce({ data: { link: 'http://authentik-server:9000/recover/xyz' } });
      const link = await service.generateSetupLink(5);
      expect(link).toBe('https://auth.test.com/recover/xyz');
    });

    // TODO (BUG): naive regex may break with proxy-added path prefixes.
    // Fix: new URL(rawLink) — set host to new URL(publicAuth).host
    it('TODO BUG: replacement uses naive regex (documents current behavior)', async () => {
      instance.post.mockResolvedValueOnce({ data: { link: 'http://authentik-server:9000/recovery/stages/email/zZaB/' } });
      const link = await service.generateSetupLink(5);
      // Replacement works for simple internal URLs; may fail for complex proxy paths
      expect(link).toContain('https://auth.test.com');
    });

    it('returns empty string and does not throw on API failure', async () => {
      instance.post.mockRejectedValueOnce(new Error('500'));
      const link = await service.generateSetupLink(5);
      expect(link).toBe('');
    });
  });

  // ── deleteUser ────────────────────────────────────────────────────────────

  describe('deleteUser()', () => {
    // TODO (DATA INTEGRITY BUG): deleteUser only removes from Authentik.
    // Mailcow mailbox and Paperless account are NOT deleted — orphaned resources.
    // Fix: implement cascadeDeleteUser that also calls Mailcow DELETE /api/v1/delete/mailbox
    // and deactivates the Paperless user.
    it('calls DELETE /api/v3/core/users/:pk/', async () => {
      instance.delete.mockResolvedValueOnce({ data: {} });
      await service.deleteUser(42);
      expect(instance.delete).toHaveBeenCalledWith('/api/v3/core/users/42/');
    });
  });

  // ── applyBranding ─────────────────────────────────────────────────────────

  describe('applyBranding()', () => {
    it('patches first brand with branding_title CollaBrains', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ brand_uuid: 'u1' }] } })
        .mockResolvedValueOnce({ data: { results: [] } }); // stages
      instance.patch.mockResolvedValue({ data: {} });
      await service.applyBranding();
      expect(instance.patch).toHaveBeenCalledWith(
        '/api/v3/core/brands/u1/',
        expect.objectContaining({ branding_title: 'CollaBrains' }),
      );
    });

    it('does nothing to brands when brand list is empty', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [] } })
        .mockResolvedValueOnce({ data: { results: [] } });
      instance.patch.mockResolvedValue({ data: {} });
      await service.applyBranding();
      // no patch call for brand (stages list is also empty)
      expect(instance.patch).not.toHaveBeenCalled();
    });

    it('strips read-only fields before patching each identification stage', async () => {
      const stage = {
        pk: 's1', component: 'ro', verbose_name: 'ro', verbose_name_plural: 'ro',
        meta_model_name: 'ro', flow_set: 'ro', name: 'ID Stage',
      };
      instance.get
        .mockResolvedValueOnce({ data: { results: [] } }) // no brands
        .mockResolvedValueOnce({ data: { results: [stage] } }); // stages
      instance.patch.mockResolvedValueOnce({ data: {} });
      await service.applyBranding();
      const payload = instance.patch.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.component).toBeUndefined();
      expect(payload.verbose_name).toBeUndefined();
      expect(payload.submit_label).toBe('Sign-In');
    });
  });

  // ── reprovisionAuthentik ──────────────────────────────────────────────────

  describe('reprovisionAuthentik()', () => {
    it('calls AuthentikService.provision with the full config from env', async () => {
      const provisionSpy = jest
        .spyOn(AuthentikService.prototype, 'provision')
        .mockResolvedValue(undefined);

      const svc = new AdminService(
        makeConfig({
          AUTHENTIK_URL: 'http://auth:9000',
          AUTHENTIK_BOOTSTRAP_TOKEN: 'token',
          PRIMARY_DOMAIN: 'test.com',
          ADMIN_EMAIL: 'admin@test.com',
          ADMIN_PASSWORD: 'pw',
          PAPERLESS_OIDC_CLIENT_ID: 'paperless-ngx',
          PAPERLESS_OIDC_CLIENT_SECRET: 'paperless-secret',
          OAUTH_CLIENT_SECRET: 'oauth-secret',
        }),
      );

      await svc.reprovisionAuthentik();

      expect(provisionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://auth:9000',
          bootstrapToken: 'token',
          primaryDomain: 'test.com',
          adminEmail: 'admin@test.com',
          adminPassword: 'pw',
          paperlessOidcClientId: 'paperless-ngx',
          paperlessOidcClientSecret: 'paperless-secret',
          oauthClientSecret: 'oauth-secret',
        }),
      );

      provisionSpy.mockRestore();
    });
  });
});
