import { Controller, ForbiddenException, Get, Headers, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import axios from 'axios';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';

// Read-only, list-only proxy for Paperless.
//
// Security model:
// - GET only (no mutations via this proxy)
// - Allowlisted prefixes — only collection endpoints (trailing slash required)
// - documents/{id}/... paths are explicitly blocked: `owner__username` is a
//   query filter that Paperless ignores on ID-based lookups, so a shared admin
//   token would expose any document by ID. Per-record access must go through
//   the authenticated /users/me/documents endpoint instead.
// - Path traversal, special characters and leading slashes rejected.
@Controller('gateway/paperless')
@UseGuards(InternalSecretGuard)
export class PaperlessProxyController {
  private readonly paperlessUrl: string;
  private readonly paperlessToken: string;

  private static readonly SAFE_PATH_RE = /^[a-zA-Z0-9/_-]+$/;

  // Only collection (list) endpoints are proxied — no per-record ID paths.
  private static readonly ALLOWED_COLLECTIONS = new Set([
    'documents/',
    'tags/',
    'document_types/',
    'correspondents/',
    'storage_paths/',
    'saved_views/',
  ]);

  // Reject paths that contain a numeric segment (per-record access).
  // e.g. documents/42/ or documents/42/preview/ are blocked.
  private static readonly RECORD_ID_RE = /\/\d+\//;

  constructor(private readonly config: ConfigService) {
    this.paperlessUrl = config.get('PAPERLESS_INTERNAL_URL') ?? 'http://paperless:8000';
    this.paperlessToken = config.get('PAPERLESS_API_TOKEN') ?? '';
  }

  @Get('*path')
  async proxy(
    @Param('path') path: string,
    @Query() query: Record<string, string>,
    @Headers('x-authentik-username') username: string,
    @Res() res: Response,
  ) {
    const safePath = (path ?? '').replace(/^\/+/, '');

    // Basic sanity / traversal checks
    if (
      !safePath ||
      safePath.includes('..') ||
      safePath.includes('//') ||
      !PaperlessProxyController.SAFE_PATH_RE.test(safePath)
    ) {
      throw new ForbiddenException('Invalid path');
    }

    // Block per-record ID access — e.g. documents/42/ or documents/42/preview/
    if (PaperlessProxyController.RECORD_ID_RE.test(`/${safePath}`)) {
      throw new ForbiddenException('Direct record access not permitted via this proxy');
    }

    // Enforce collection-only allowlist
    const normalised = safePath.endsWith('/') ? safePath : `${safePath}/`;
    if (!PaperlessProxyController.ALLOWED_COLLECTIONS.has(normalised)) {
      throw new ForbiddenException('Path not permitted');
    }

    // Scope list queries to the calling user's documents
    const scopedQuery: Record<string, string> = { ...query, owner__username: username };

    try {
      const upstream = await axios.get(`${this.paperlessUrl}/api/${safePath}`, {
        headers: { Authorization: `Token ${this.paperlessToken}` },
        params: scopedQuery,
        timeout: 15_000,
        responseType: 'arraybuffer',
      });
      res.status(upstream.status);
      const ct = upstream.headers['content-type'];
      if (ct) res.setHeader('content-type', String(ct));
      res.send(upstream.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status ?? 502;
      res.status(status).json({ error: 'Paperless proxy error' });
    }
  }
}
