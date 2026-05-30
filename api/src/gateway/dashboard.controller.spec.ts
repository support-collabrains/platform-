// Covers: dashboard() returns docs + photos + user on full success,
// partial failures are isolated via Promise.allSettled (each source degrades independently),
// Paperless query is scoped to calling username (owner__username),
// Immich is skipped entirely when IMMICH_API_KEY is not set

import { of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { DashboardController } from './dashboard.controller';
import { LdapMetadataService } from '../ldap/ldap-metadata.service';

function makeHttp(getMock: jest.Mock): HttpService {
  return { get: getMock } as unknown as HttpService;
}

function makeLdap(overrides: Partial<LdapMetadataService> = {}): LdapMetadataService {
  return {
    getAttributes: jest.fn().mockResolvedValue({ signalPhone: '+31611' }),
    ...overrides,
  } as unknown as LdapMetadataService;
}

function makeController(
  http: HttpService,
  ldap: LdapMetadataService,
  overrides: Record<string, string> = {},
): DashboardController {
  const cfg: Record<string, string> = {
    PAPERLESS_INTERNAL_URL: 'http://paperless:8000',
    PAPERLESS_API_TOKEN: 'tok',
    IMMICH_INTERNAL_URL: 'http://immich:2283',
    IMMICH_API_KEY: 'ikey',
    ...overrides,
  };
  return new DashboardController(
    http,
    { get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService,
    ldap,
  );
}

describe('DashboardController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns docs, photos, and user attributes on full success', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [{ id: 1, title: 'Doc' }] } })) // paperless
      .mockReturnValueOnce(of({ data: [{ id: 'ph1' }] }));                        // immich
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    const result = await ctrl.dashboard('alice');
    expect(result.docs).toHaveLength(1);
    expect(result.photos).toHaveLength(1);
    expect(result.user).toMatchObject({ signalPhone: '+31611' });
  });

  it('returns empty docs when Paperless fetch throws', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(throwError(() => new Error('paperless down')))
      .mockReturnValueOnce(of({ data: [] }));
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    const result = await ctrl.dashboard('alice');
    expect(result.docs).toEqual([]);
  });

  it('returns empty photos when Immich fetch throws', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }))
      .mockReturnValueOnce(throwError(() => new Error('immich down')));
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    const result = await ctrl.dashboard('alice');
    expect(result.photos).toEqual([]);
  });

  it('returns empty user when LDAP getAttributes throws', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }))
      .mockReturnValueOnce(of({ data: [] }));
    const ldap = makeLdap({ getAttributes: jest.fn().mockRejectedValue(new Error('ldap down')) });
    const ctrl = makeController(makeHttp(getStub), ldap);
    const result = await ctrl.dashboard('alice');
    expect(result.user).toEqual({});
  });

  it('skips Immich fetch when IMMICH_API_KEY is empty', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }));
    const ctrl = makeController(makeHttp(getStub), makeLdap(), { IMMICH_API_KEY: '' });
    const result = await ctrl.dashboard('alice');
    expect(result.photos).toEqual([]);
    // Immich get should never be called
    expect(getStub).toHaveBeenCalledTimes(1);
  });

  it('scopes Paperless docs query to authenticated username', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }))
      .mockReturnValueOnce(of({ data: [] }));
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    await ctrl.dashboard('charlie');
    const [, paperlessOpts] = getStub.mock.calls[0] as [string, { params: Record<string, string> }];
    expect(paperlessOpts.params.owner__username).toBe('charlie');
  });

  it('sends Bearer token auth header to Paperless', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }))
      .mockReturnValueOnce(of({ data: [] }));
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    await ctrl.dashboard('alice');
    const [, paperlessOpts] = getStub.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(paperlessOpts.headers.Authorization).toBe('Token tok');
  });

  it('sends x-api-key header to Immich', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(of({ data: { results: [] } }))
      .mockReturnValueOnce(of({ data: [] }));
    const ctrl = makeController(makeHttp(getStub), makeLdap());
    await ctrl.dashboard('alice');
    const [, immichOpts] = getStub.mock.calls[1] as [string, { headers: Record<string, string> }];
    expect(immichOpts.headers['x-api-key']).toBe('ikey');
  });

  it('handles all three sources failing simultaneously', async () => {
    const getStub = jest.fn()
      .mockReturnValueOnce(throwError(() => new Error('down')))
      .mockReturnValueOnce(throwError(() => new Error('down')));
    const ldap = makeLdap({ getAttributes: jest.fn().mockRejectedValue(new Error('down')) });
    const ctrl = makeController(makeHttp(getStub), ldap);
    const result = await ctrl.dashboard('alice');
    expect(result.docs).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result.user).toEqual({});
  });
});
