import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Redis from 'ioredis';

export interface LdapUserAttributes {
  signalPhone?: string;
  paperlessUserId?: number;
  defaultArchivePath?: string;
  phone?: string;
  phone2?: string;
  language?: string;
  mail_imap_password?: string;
}

const CACHE_TTL_SEC = 300; // 5 minutes

@Injectable()
export class LdapMetadataService implements OnModuleDestroy {
  private readonly logger = new Logger(LdapMetadataService.name);
  private readonly redis: Redis;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(private readonly config: ConfigService) {
    const redisUrl = config.get<string>('QUEUE_REDIS_URL') ?? 'redis://queue-redis:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
    this.redis.on('error', (err) => this.logger.warn(`Redis error: ${(err as Error).message}`));
    this.authentikUrl = config.get<string>('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get<string>('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private cacheKey(username: string): string {
    return `ldap:user:${username}:attrs`;
  }

  async getAttributes(username: string): Promise<LdapUserAttributes> {
    try {
      const cached = await this.redis.get(this.cacheKey(username));
      if (cached) return JSON.parse(cached) as LdapUserAttributes;
    } catch {
      // Redis unavailable — fall through
    }

    const { data } = await axios.get<{ results: Array<{ attributes: LdapUserAttributes }> }>(
      `${this.authentikUrl}/api/v3/core/users/`,
      {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { username, page_size: 1 },
        timeout: 8_000,
      },
    );
    const attrs = (data.results?.[0]?.attributes ?? {}) as LdapUserAttributes;

    try {
      await this.redis.setex(this.cacheKey(username), CACHE_TTL_SEC, JSON.stringify(attrs));
    } catch {
      // Non-fatal
    }

    return attrs;
  }

  async setAttributes(username: string, patch: Partial<LdapUserAttributes>): Promise<void> {
    const { data } = await axios.get<{ results: Array<{ pk: number; attributes: LdapUserAttributes }> }>(
      `${this.authentikUrl}/api/v3/core/users/`,
      {
        headers: { Authorization: `Bearer ${this.authentikToken}` },
        params: { username, page_size: 1 },
        timeout: 8_000,
      },
    );
    const user = data.results?.[0];
    if (!user) throw new Error(`User not found: ${username}`);

    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${user.pk}/`,
      { attributes: { ...(user.attributes ?? {}), ...patch } },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );

    try {
      await this.redis.del(this.cacheKey(username));
    } catch {
      // Non-fatal
    }

    this.logger.log(`Updated LDAP attributes for ${username}: ${Object.keys(patch).join(', ')}`);
  }

  async setAttributesByPk(pk: number, patch: Partial<LdapUserAttributes>): Promise<void> {
    const { data: user } = await axios.get<{ pk: number; username: string; attributes: LdapUserAttributes }>(
      `${this.authentikUrl}/api/v3/core/users/${pk}/`,
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );
    await axios.patch(
      `${this.authentikUrl}/api/v3/core/users/${pk}/`,
      { attributes: { ...(user.attributes ?? {}), ...patch } },
      { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 8_000 },
    );

    try {
      await this.redis.del(this.cacheKey(user.username));
    } catch {
      // Non-fatal
    }

    this.logger.log(`Updated LDAP attributes for pk=${pk}: ${Object.keys(patch).join(', ')}`);
  }

  async invalidate(username: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(username));
    } catch {
      // Non-fatal
    }
  }
}
