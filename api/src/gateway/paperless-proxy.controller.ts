import { Controller, ForbiddenException, Get, Headers, Post, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
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

  @Post('upload')
  async upload(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Buffer de inkomende request zodat we de exacte bytes kunnen forwarden
      const rawBody = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });

      const upstream = await axios.post(
        `${this.paperlessUrl}/api/documents/post_document/`,
        rawBody,
        {
          headers: {
            Authorization: `Token ${this.paperlessToken}`,
            'content-type': req.headers['content-type'] ?? 'multipart/form-data',
            'content-length': rawBody.length,
          },
          timeout: 120_000,
          responseType: 'arraybuffer',
          maxBodyLength: 50 * 1024 * 1024,
          maxContentLength: 50 * 1024 * 1024,
        },
      );
      res.status(upstream.status).send(upstream.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: Buffer } };
      const status = axiosErr?.response?.status ?? 502;
      const msg = axiosErr?.response?.data
        ? axiosErr.response.data.toString('utf8').slice(0, 200)
        : 'Upload mislukt';
      res.status(status).json({ error: msg });
    }
  }
}
