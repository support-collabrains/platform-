import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { FinanceTransaction } from './finance.entity';
import { FinanceExtractorService } from './finance-extractor.service';
import { MailImapService } from '../mail/mail-imap.service';

const FINANCE_KEYWORDS = ['factuur', 'rekening', 'abonnement', 'betaling', 'invoice', 'payment', 'subscription'];

@Injectable()
export class FinanceMailPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FinanceMailPollerService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(
    @InjectRepository(FinanceTransaction)
    private readonly repo: Repository<FinanceTransaction>,
    private readonly extractor: FinanceExtractorService,
    private readonly mail: MailImapService,
    private readonly config: ConfigService,
  ) {
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? 'http://authentik-server:9000';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  onModuleInit() {
    setTimeout(() => {
      void this.scanAllUsers();
      this.interval = setInterval(() => void this.scanAllUsers(), 15 * 60 * 1000);
    }, 2 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async scanAllUsers(): Promise<void> {
    try {
      const { data } = await axios.get(
        `${this.authentikUrl}/api/v3/core/users/?is_active=true&page_size=50`,
        { headers: { Authorization: `Bearer ${this.authentikToken}` } },
      );
      const users: Array<{ username: string; attributes?: Record<string, string> }> = data.results ?? [];
      for (const user of users) {
        if (user.attributes?.signalPhone) {
          await this.scanUser(user.username, user.attributes ?? {}).catch(err =>
            this.logger.warn(`scanUser ${user.username} mislukt: ${(err as Error).message}`)
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Finance mail scan mislukt: ${(err as Error).message}`);
    }
  }

  async scanUser(username: string, attrs: Record<string, string>): Promise<void> {
    try {
      const result = await this.mail.getMessages(username, 'INBOX', 1, 50);
      for (const msg of result.messages) {
        if (!this.isFinancialMail(msg.subject, msg.hasAttachment)) continue;

        const exists = await this.repo.findOne({
          where: { owner: username, source: 'mail', sourceRef: String(msg.uid) },
        });
        if (exists) continue;

        const detail = await this.mail.getMessage(username, 'INBOX', msg.uid).catch(() => null);
        if (!detail) continue;

        const text = detail.bodyText || detail.bodyHtml?.replace(/<[^>]+>/g, ' ') || msg.subject;
        const extracted = await this.extractor.extract(text);
        if (!extracted || extracted.confidence < 0.5) continue;

        await this.repo.save({
          owner: username,
          source: 'mail' as const,
          sourceRef: String(msg.uid),
          leverancier: extracted.leverancier,
          bedrag: extracted.bedrag,
          datum: extracted.datum,
          categorie: extracted.categorie,
          type: extracted.type,
          status: 'pending' as const,
        });
        this.logger.log(`Finance: mail transactie voor ${username} — ${extracted.leverancier}`);
      }
    } catch (err) {
      this.logger.warn(`Finance mail scan ${username} mislukt: ${(err as Error).message}`);
    }
  }

  private isFinancialMail(subject: string, hasAttachment: boolean): boolean {
    const lower = subject.toLowerCase();
    return hasAttachment || FINANCE_KEYWORDS.some(kw => lower.includes(kw));
  }
}
