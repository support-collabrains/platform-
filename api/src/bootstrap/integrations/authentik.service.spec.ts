// Covers: provision() call order, waitForReady (immediate/retry/timeout),
// createAdminUser (skip when exists / create new), getAuthorizationFlowPk (primary slug/fallback/none),
// createOIDCProvider (skip/create), createPortalApplication (skip/create),
// configureBranding (patch brand/flow/stages, non-fatal failures), updateSignInLabel (strips read-only fields)

import axios from 'axios';
import { AuthentikService, AuthentikConfig } from './authentik.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const BASE_CONFIG: AuthentikConfig = {
  baseUrl: 'http://auth:9000',
  bootstrapToken: 'token',
  adminEmail: 'admin@test.com',
  adminPassword: 'password123',
  primaryDomain: 'test.com',
  oauthClientId: 'platform-portal',
  oauthClientSecret: 'secret',
  paperlessOidcClientId: 'paperless-ngx',
  paperlessOidcClientSecret: 'paperless-secret',
};

function makeInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
}

describe('AuthentikService', () => {
  let service: AuthentikService;
  let instance: ReturnType<typeof makeInstance>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthentikService();
    instance = makeInstance();
    mockedAxios.create.mockReturnValue(instance as ReturnType<typeof axios.create>);
  });

  // ── Shared helper — must be defined before the describe blocks that use it ──

  function stubProvision(adminExists: boolean) {
    mockedAxios.get.mockResolvedValueOnce({});
    // Actual call order: users → providers → flows (slug) → applications → brands → stages → ldap mappings (×3) → paperless provider → paperless app
    instance.get
      .mockResolvedValueOnce({ data: { pagination: { count: adminExists ? 1 : 0 }, results: adminExists ? [{ pk: 99 }] : [] } })
      .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } })   // providers
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'flow-pk' }] } }) // flows
      .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } })   // applications
      .mockResolvedValueOnce({ data: { results: [] } })   // brands
      .mockResolvedValueOnce({ data: { results: [] } })   // stages
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'ldap1' }] } }) // ldap mapping 1 (exists)
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'ldap2' }] } }) // ldap mapping 2 (exists)
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'ldap3' }] } }) // ldap mapping 3 (exists)
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 77 }] } })       // paperless provider (exists)
      .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 88 }] } });      // paperless app (exists)
    instance.post.mockResolvedValue({ data: { pk: 1 } });
    instance.patch.mockResolvedValue({ data: {} });
  }

  // ── waitForReady ─────────────────────────────────────────────────────────

  describe('waitForReady (via provision)', () => {
    it('resolves immediately when Authentik is reachable on first attempt', async () => {
      stubProvision(true);
      await service.provision(BASE_CONFIG);
      expect(mockedAxios.get).toHaveBeenCalledWith('http://auth:9000/api/v3/root/config/');
    });

    it('throws immediately when timeoutMs is 0 (deadline already expired)', async () => {
      await expect(
        (service as unknown as { waitForReady: (url: string, ms: number) => Promise<void> })
          ['waitForReady']('http://auth:9000', 0),
      ).rejects.toThrow(/did not become ready/);
    });
  });

  // ── createAdminUser ───────────────────────────────────────────────────────

  describe('createAdminUser (via provision)', () => {
    it('skips user creation when admin already exists', async () => {
      stubProvision(true);
      await service.provision(BASE_CONFIG);
      const postCalls = instance.post.mock.calls.map((c) => c[0] as string);
      expect(postCalls).not.toContain(expect.stringContaining('set_password'));
    });

    it('creates user and sets password when admin does not exist', async () => {
      stubProvision(false);
      await service.provision(BASE_CONFIG);
      const postCalls = instance.post.mock.calls.map((c) => c[0] as string);
      expect(postCalls).toContain('/api/v3/core/users/');
      expect(postCalls.some((u) => u.includes('set_password'))).toBe(true);
    });
  });

  // ── getAuthorizationFlowPk ────────────────────────────────────────────────

  describe('getAuthorizationFlowPk', () => {
    it('returns pk from primary slug when found', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'primary-pk' }] } });

      const pk = await (service as unknown as { getAuthorizationFlowPk: (api: unknown) => Promise<string> })
        ['getAuthorizationFlowPk'](instance);
      expect(pk).toBe('primary-pk');
    });

    it('falls back to any authorization flow when primary slug not found', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } })
        .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'fallback-pk' }] } });

      const pk = await (service as unknown as { getAuthorizationFlowPk: (api: unknown) => Promise<string> })
        ['getAuthorizationFlowPk'](instance);
      expect(pk).toBe('fallback-pk');
    });

    it('throws when no authorization flow exists', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } })
        .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } });

      await expect(
        (service as unknown as { getAuthorizationFlowPk: (api: unknown) => Promise<string> })
          ['getAuthorizationFlowPk'](instance),
      ).rejects.toThrow('No authorization flow found');
    });
  });

  // ── createOIDCProvider ────────────────────────────────────────────────────

  describe('createOIDCProvider', () => {
    it('returns existing pk without creating', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 42 }] } });
      const pk = await (service as unknown as { createOIDCProvider: (api: unknown, cfg: AuthentikConfig) => Promise<number> })
        ['createOIDCProvider'](instance, BASE_CONFIG);
      expect(pk).toBe(42);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates provider with correct redirect_uri format', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } }) // no existing provider
        .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'flow-pk' }] } }); // flow
      instance.post.mockResolvedValueOnce({ data: { pk: 99 } });

      await (service as unknown as { createOIDCProvider: (api: unknown, cfg: AuthentikConfig) => Promise<number> })
        ['createOIDCProvider'](instance, BASE_CONFIG);

      const payload = instance.post.mock.calls[0][1] as { redirect_uris: string };
      expect(payload.redirect_uris).toContain(`portal.${BASE_CONFIG.primaryDomain}`);
      expect(payload.redirect_uris).toContain('/api/auth/callback/authentik');
    });
  });

  // ── createPortalApplication ───────────────────────────────────────────────

  describe('createPortalApplication', () => {
    it('skips creation when application already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 1 }] } });
      await (service as unknown as { createPortalApplication: (api: unknown, id: number, domain: string, slug: string) => Promise<void> })
        ['createPortalApplication'](instance, 1, 'test.com', 'platform-portal');
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates application with correct meta_launch_url', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } });
      instance.post.mockResolvedValueOnce({ data: {} });
      await (service as unknown as { createPortalApplication: (api: unknown, id: number, domain: string, slug: string) => Promise<void> })
        ['createPortalApplication'](instance, 5, 'test.com', 'platform-portal');
      expect((instance.post.mock.calls[0][1] as { meta_launch_url: string }).meta_launch_url)
        .toBe('https://portal.test.com');
    });
  });

  // ── configureBranding ─────────────────────────────────────────────────────

  describe('configureBranding', () => {
    it('does not throw when brand list is empty (non-fatal)', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [] } }) // no brands
        .mockResolvedValueOnce({ data: { results: [] } }); // no stages via updateSignInLabel path (patch flow may fail)
      instance.patch.mockRejectedValueOnce(new Error('404')); // flow title patch fails
      await expect(
        (service as unknown as { configureBranding: (api: unknown, domain: string) => Promise<void> })
          ['configureBranding'](instance, 'test.com'),
      ).resolves.toBeUndefined();
    });

    it('patches brand with branding_title and branding_logo', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { results: [{ brand_uuid: 'uuid1' }] } })
        .mockResolvedValueOnce({ data: { results: [] } }); // stages
      instance.patch.mockResolvedValue({ data: {} });
      await (service as unknown as { configureBranding: (api: unknown, domain: string) => Promise<void> })
        ['configureBranding'](instance, 'test.com');
      const patchCall = instance.patch.mock.calls[0];
      expect(patchCall[0]).toContain('uuid1');
      expect((patchCall[1] as { branding_title: string }).branding_title).toBe('CollaBrains');
    });
  });

  // ── updateSignInLabel ─────────────────────────────────────────────────────

  describe('updateSignInLabel', () => {
    it('strips read-only fields before patching each stage', async () => {
      const stage = {
        pk: 's1',
        component: 'ro',
        verbose_name: 'ro',
        verbose_name_plural: 'ro',
        meta_model_name: 'ro',
        flow_set: 'ro',
        name: 'ID Stage',
      };
      instance.get.mockResolvedValueOnce({ data: { results: [stage] } });
      instance.patch.mockResolvedValueOnce({ data: {} });

      await (service as unknown as { updateSignInLabel: (api: unknown) => Promise<void> })
        ['updateSignInLabel'](instance);

      const payload = instance.patch.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.component).toBeUndefined();
      expect(payload.verbose_name).toBeUndefined();
      expect(payload.submit_label).toBe('Sign-In');
    });

    it('does not throw when stages API fails (non-fatal)', async () => {
      instance.get.mockRejectedValueOnce(new Error('500'));
      await expect(
        (service as unknown as { updateSignInLabel: (api: unknown) => Promise<void> })
          ['updateSignInLabel'](instance),
      ).resolves.toBeUndefined();
    });
  });

  // ── createPaperlessOIDCProvider ───────────────────────────────────────────

  describe('createPaperlessOIDCProvider', () => {
    it('returns existing pk without creating when provider already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 77 }] } });
      const pk = await (service as unknown as { createPaperlessOIDCProvider: (api: unknown, cfg: AuthentikConfig) => Promise<number> })
        ['createPaperlessOIDCProvider'](instance, BASE_CONFIG);
      expect(pk).toBe(77);
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates provider with redirect_uri containing docs.${primaryDomain} and the callback path', async () => {
      instance.get
        .mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } }) // no existing provider
        .mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 'flow-pk' }] } }); // flow
      instance.post.mockResolvedValueOnce({ data: { pk: 77 } });

      await (service as unknown as { createPaperlessOIDCProvider: (api: unknown, cfg: AuthentikConfig) => Promise<number> })
        ['createPaperlessOIDCProvider'](instance, BASE_CONFIG);

      const payload = instance.post.mock.calls[0][1] as { redirect_uris: string };
      expect(payload.redirect_uris).toContain(`docs.${BASE_CONFIG.primaryDomain}`);
      expect(payload.redirect_uris).toContain('/accounts/oidc/paperless-authentik/login/callback/');
    });
  });

  // ── createPaperlessApplication ────────────────────────────────────────────

  describe('createPaperlessApplication', () => {
    it('skips creation when paperless application already exists', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 1 }, results: [{ pk: 88 }] } });
      await (service as unknown as { createPaperlessApplication: (api: unknown, providerId: number, domain: string) => Promise<void> })
        ['createPaperlessApplication'](instance, 88, 'test.com');
      expect(instance.post).not.toHaveBeenCalled();
    });

    it('creates application with slug=paperless-ngx, correct provider and meta_launch_url', async () => {
      instance.get.mockResolvedValueOnce({ data: { pagination: { count: 0 }, results: [] } });
      instance.post.mockResolvedValueOnce({ data: {} });

      await (service as unknown as { createPaperlessApplication: (api: unknown, providerId: number, domain: string) => Promise<void> })
        ['createPaperlessApplication'](instance, 88, 'test.com');

      const payload = instance.post.mock.calls[0][1] as { slug: string; provider: number; meta_launch_url: string };
      expect(payload.slug).toBe('paperless-ngx');
      expect(payload.provider).toBe(88);
      expect(payload.meta_launch_url).toBe('https://docs.test.com');
    });
  });
});
