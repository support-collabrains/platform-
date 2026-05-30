import { Controller, ForbiddenException, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import axios from 'axios';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';

// Read-only proxy — only GET is allowed, path is sanitized, allowed endpoints
// are allowlisted. Immich is a shared household album so results are not
// per-user filtered (shared library is the intended design).
@Controller('gateway/immich')
@UseGuards(InternalSecretGuard)
export class ImmichProxyController {
  private readonly immichUrl: string;
  private readonly immichApiKey: string;

  private static readonly ALLOWED_PATH_RE = /^[a-zA-Z0-9/_.-]+$/;
  private static readonly ALLOWED_PREFIXES = [
    'assets',
    'albums',
    'people',
    'tags',
    'server',
    'shared-links',
  ];

  constructor(private readonly config: ConfigService) {
    this.immichUrl = config.get('IMMICH_INTERNAL_URL') ?? 'http://immich-server:2283';
    this.immichApiKey = config.get('IMMICH_API_KEY') ?? '';
  }

  @Get('*path')
  async proxy(
    @Param('path') path: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const safePath = (path ?? '').replace(/^\/+/, '');

    if (
      !safePath ||
      safePath.includes('..') ||
      safePath.includes('//') ||
      !ImmichProxyController.ALLOWED_PATH_RE.test(safePath)
    ) {
      throw new ForbiddenException('Invalid path');
    }

    const topSegment = safePath.split('/')[0];
    if (!ImmichProxyController.ALLOWED_PREFIXES.includes(topSegment)) {
      throw new ForbiddenException('Path not permitted');
    }

    try {
      const upstream = await axios.get(`${this.immichUrl}/api/${safePath}`, {
        headers: { 'x-api-key': this.immichApiKey },
        params: query,
        timeout: 15_000,
        responseType: 'arraybuffer',
      });
      res.status(upstream.status);
      const ct = upstream.headers['content-type'];
      if (ct) res.setHeader('content-type', String(ct));
      res.send(upstream.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status ?? 502;
      res.status(status).json({ error: 'Immich proxy error' });
    }
  }
}
