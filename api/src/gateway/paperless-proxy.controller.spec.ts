// Covers: path validation (empty, traversal .., //, special chars, per-record ID, non-allowlist),
// allowed collection paths (documents/ tags/ document_types/ correspondents/ storage_paths/ saved_views/),
// proxy success (status forwarded, content-type set, owner__username scoped, auth header),
// proxy failure (upstream error → 502, upstream 4xx → correct status code)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { PaperlessProxyController } from './paperless-proxy.controller';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeController(overrides: Record<string, string> = {}): PaperlessProxyController {
  const cfg: Record<string, string> = {
    PAPERLESS_INTERNAL_URL: 'http://paperless:8000',
    PAPERLESS_API_TOKEN: 'tok123',
    ...overrides,
  };
  return new PaperlessProxyController({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
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
  data: Buffer.from('{}'),
};

describe('PaperlessProxyController', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── path validation ──────────────────────────────────────────────────────

  describe('path validation', () => {
    it('throws ForbiddenException for empty path', async () => {
      await expect(
        makeController().proxy('', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path containing ..', async () => {
      await expect(
        makeController().proxy('../../etc/passwd', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path containing //', async () => {
      await expect(
        makeController().proxy('documents//evil', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path with angle brackets', async () => {
      await expect(
        makeController().proxy('documents/<script>', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for path with spaces', async () => {
      await expect(
        makeController().proxy('documents/ evil', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for per-record ID access documents/42/', async () => {
      await expect(
        makeController().proxy('documents/42/', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for nested record path documents/42/preview/', async () => {
      await expect(
        makeController().proxy('documents/42/preview/', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for non-allowlisted path admin/', async () => {
      await expect(
        makeController().proxy('admin/', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException for non-allowlisted path api/', async () => {
      await expect(
        makeController().proxy('api/', {}, 'alice', makeRes() as unknown as Response),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([
      'documents/',
      'tags/',
      'document_types/',
      'correspondents/',
      'storage_paths/',
      'saved_views/',
    ])('allows allowlisted collection path: %s', async (path) => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      const res = makeRes();
      await makeController().proxy(path, {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(200);
    });

    it('normalises path without trailing slash to match allowlist', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      const res = makeRes();
      await makeController().proxy('documents', {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(200);
    });

    it('strips leading slashes before validation', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      const res = makeRes();
      await makeController().proxy('/documents/', {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(200);
    });
  });

  // ── proxy behaviour ──────────────────────────────────────────────────────

  describe('proxy behaviour', () => {
    it('adds owner__username to upstream query params', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController().proxy('documents/', { page: '2' }, 'alice', makeRes() as unknown as Response);
      const params = mockedAxios.get.mock.calls[0][1]?.params as Record<string, string>;
      expect(params.owner__username).toBe('alice');
      expect(params.page).toBe('2');
    });

    it('sends Bearer token auth to upstream', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController().proxy('documents/', {}, 'alice', makeRes() as unknown as Response);
      const headers = mockedAxios.get.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Token tok123');
    });

    it('forwards upstream HTTP status to response', async () => {
      mockedAxios.get.mockResolvedValueOnce({ ...OK_UPSTREAM, status: 200 });
      const res = makeRes();
      await makeController().proxy('documents/', {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(200);
    });

    it('sets content-type header from upstream', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        ...OK_UPSTREAM,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
      const res = makeRes();
      await makeController().proxy('documents/', {}, 'alice', res as unknown as Response);
      expect(res._headers['content-type']).toBe('application/json; charset=utf-8');
    });

    it('sends body via res.send()', async () => {
      const bodyBuf = Buffer.from('{"count":0}');
      mockedAxios.get.mockResolvedValueOnce({ ...OK_UPSTREAM, data: bodyBuf });
      const res = makeRes();
      await makeController().proxy('documents/', {}, 'alice', res as unknown as Response);
      expect(res._body).toBe(bodyBuf);
    });

    it('returns 502 on generic upstream error (no response object)', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));
      const res = makeRes();
      await makeController().proxy('documents/', {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(502);
    });

    it('uses upstream status code when upstream returns an error response', async () => {
      const err = Object.assign(new Error('Not Found'), { response: { status: 404 } });
      mockedAxios.get.mockRejectedValueOnce(err);
      const res = makeRes();
      await makeController().proxy('documents/', {}, 'alice', res as unknown as Response);
      expect(res._status).toBe(404);
    });

    it('uses configured PAPERLESS_INTERNAL_URL as upstream base', async () => {
      mockedAxios.get.mockResolvedValueOnce(OK_UPSTREAM);
      await makeController({ PAPERLESS_INTERNAL_URL: 'http://custom-paperless:9000', PAPERLESS_API_TOKEN: 't' })
        .proxy('documents/', {}, 'alice', makeRes() as unknown as Response);
      expect(mockedAxios.get.mock.calls[0][0]).toContain('http://custom-paperless:9000');
    });
  });
});
