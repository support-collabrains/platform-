import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceSubscription } from './finance.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FinanceAlertService {
  private readonly logger = new Logger(FinanceAlertService.name);

  constructor(
    @InjectRepository(FinanceSubscription)
    private readonly repo: Repository<FinanceSubscription>,
    private readonly notifications: NotificationsService,
  ) {}

  async checkUser(owner: string, signalPhone?: string): Promise<string[]> {
    const subs = await this.repo.find({ where: { owner, actief: true } });
    const upcoming = this.getUpcomingDeadlines(subs);
    const messages: string[] = [];

    for (const sub of upcoming) {
      const deadlineDate = new Date(sub.volgendeBetaaldatum);
      deadlineDate.setDate(deadlineDate.getDate() - sub.opzegtermijnDagen);
      const daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / 86_400_000);
      const msg = daysLeft <= 0
        ? `⚠️ Abonnement ${sub.naam} (€${sub.bedrag}/mnd) — opzegtermijn al verstreken!`
        : `⚠️ Abonnement ${sub.naam} (€${sub.bedrag}/mnd) — nog ${daysLeft} dag(en) om op te zeggen`;
      messages.push(msg);
      if (signalPhone) {
        await this.notifications.send(signalPhone, msg).catch(() => {});
      }
    }
    return messages;
  }

  private getUpcomingDeadlines(subs: FinanceSubscription[]): FinanceSubscription[] {
    const now = Date.now();
    return subs.filter(sub => {
      const betaaldatum = new Date(sub.volgendeBetaaldatum).getTime();
      const deadline = betaaldatum - sub.opzegtermijnDagen * 86_400_000;
      const daysUntilDeadline = Math.ceil((deadline - now) / 86_400_000);
      return daysUntilDeadline <= 14;
    });
  }
}
