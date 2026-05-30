// Covers: path validation (empty, .., //, special chars, non-allowed top segment),
// allowed prefixes (assets albums people tags server shared-links),
// proxy success (status, content-type, body forwarded; x-api-key header sent),
// proxy failure (upstream error → 502, upstream 4xx → correct status)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { ImmichProxyController } from './immich-proxy.controller';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeController(overrides: Record<string, string> = {}): ImmichProxyController {
  const cfg: Record<string, string> = {
    IMMICH_INTERNAL_URL: 'http://immich:2283',
    IMMICH_API_KEY: 'immich-key',
    ...overrides,
  };
  return new ImmichProxyController({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
}

function makeRes() {
  const res = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: undefined as unknown,
    status(s: number) { this._status = s; return this; },
    setHeader(k: string, v: string) { this._headers[k] = v; return this; },
    send(b: unknown) { this._body = b; },
    json(b: unknown) { this._body = b; },
  };
  return res;
}

const OK_UPSTREAM = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  data: Buffer.from('[]'),
};

describe('ImmichProxyController', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── path validation ──────────────────────────────────────────────────────

  describe('path validation', () => {
    it('throws ForbiddenException for empty path', async () => {
      await expect(
        makeController().proxy('', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path containing ..', async () => {
      await expect(
        makeController().proxy('../etc/passwd', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path containing //', async () => {
      await expect(
        makeController().proxy('assets//evil', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path with special characters', async () => {
      await expect(
        makeController().proxy('assets/<script>', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for non-allowed top segment "admin"', async () => {
      await expect(
        makeController().proxy('admin/users', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for non-allowed top segment "auth"', async () => {
      await expect(
        makeController().proxy('auth/token', {}, makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['assets', 'albums', 'people', 'tags', 'server', 'shared-links'])(
      'allows allowed prefix: %s',
      async (prefix) => {
        mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
        const res = makeRes();
        await makeController().proxy(prefix, {}, res as unknown as Response);
        expect(res._status).toBe(200);
      },
    );

    it('allows allowed prefix with sub-path (albums/abc)', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      const res = makeRes();
      await makeController().proxy('albums/abc-123', {}, res as unknown as Response);
      expect(res._status).toBe(200);
    });

    it('strips leading slashes before validation', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      const res = makeRes();
      await makeController().proxy('/assets', {}, res as unknown as Response);
      expect(res._status).toBe(200);
    });
  });

  // ── proxy behaviour ──────────────────────────────────────────────────────

  describe('proxy behaviour', () => {
    it('sends x-api-key header to upstream', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController().proxy('assets', {}, makeRes() as unknown as Response);
      const headers = mockedAxios.get.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('immich-key');
    });

    it('forwards query params to upstream', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController().proxy('assets', { take: '12' }, makeRes() as unknown as Response);
      const params = mockedAxios.get.mock.calls[0][1]?.params as Record<string, string>;
      expect(params.take).toBe('12');
    });

    it('forwards upstream HTTP status to response', async () => {
      mockedAxios.get.mockResolvedValueOnce({ ...OK_UPSTREAM, status: 200 });
      const res = makeRes();
      await makeController().proxy('assets', {}, res as unknown as Response);
      expect(res._status).toBe(200);
    });

    it('sets content-type header from upstream', async () => {
      mockedAxios.get.mockResolvedValueOnce({ ...OK_UPSTREAM, headers: { 'content-type': 'image/jpeg' } });
      const res = makeRes();
      await makeController().proxy('assets/photo.jpg', {}, res as unknown as Response);
      expect(res._headers['content-type']).toBe('image/jpeg');
    });

    it('sends body data via res.send()', async () => {
      const buf = Buffer.from('[{"id":"ph1"}]');
      mockedAxios.get.mockResolvedValueOnce({ ...OK_UPSTREAM, data: buf });
      const res = makeRes();
      await makeController().proxy('assets', {}, res as unknown as Response);
      expect(res._body).toBe(buf);
    });

    it('returns 502 on generic upstream error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));
      const res = makeRes();
      await makeController().proxy('assets', {}, res as unknown as Response);
      expect(res._status).toBe(502);
    });

    it('uses upstream status code when upstream returns an error response', async () => {
      const err = Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
      mockedAxios.get.mockRejectedValueOnce(err);
      const res = makeRes();
      await makeController().proxy('assets', {}, res as unknown as Response);
      expect(res._status).toBe(401);
    });

    it('uses configured IMMICH_INTERNAL_URL as upstream base', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController({ IMMICH_INTERNAL_URL: 'http://custom:9999', IMMICH_API_KEY: 'k' })
        .proxy('assets', {}, makeRes() as unknown as Response);
      expect(mockedAxios.get.mock.calls[0][0]).toContain('http://custom:9999');
    });
  });
});
