import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './push-subscription.entity';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly adminEmail: string;
  private vapidConfigured = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PushSubscription) private readonly repo: Repository<PushSubscription>,
  ) {
    this.vapidPublicKey = config.get<string>('VAPID_PUBLIC_KEY') ?? '';
    this.vapidPrivateKey = config.get<string>('VAPID_PRIVATE_KEY') ?? '';
    this.adminEmail = config.get<string>('ADMIN_EMAIL') ?? 'admin@example.com';
  }

  onModuleInit() {
    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(
        `mailto:${this.adminEmail}`,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );
      this.vapidConfigured = true;
      this.logger.log('VAPID keys configured for web push');
    } else {
      this.logger.warn('VAPID keys not set — push notifications disabled');
    }
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  async saveSubscription(username: string, subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }): Promise<void> {
    await this.repo.upsert(
      { username, endpoint: subscription.endpoint, keys: subscription.keys },
      ['endpoint'],
    );
    this.logger.log(`Push subscription saved for ${username}`);
  }

  async sendToUser(username: string, title: string, body: string): Promise<void> {
    if (!this.vapidConfigured) return;
    const subs = await this.repo.find({ where: { username } });
    const payload = JSON.stringify({ title, body });
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload),
      ),
    );
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length}/${subs.length} push notifications failed for ${username}`);
      // Remove subscriptions that returned 410 Gone
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'rejected') {
          const err = r.reason as { statusCode?: number };
          if (err?.statusCode === 410) {
            await this.repo.delete({ endpoint: subs[i].endpoint });
          }
        }
      }
    }
  }
}
