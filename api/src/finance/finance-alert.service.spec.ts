import { FinanceAlertService } from './finance-alert.service';
import { FinanceSubscription } from './finance.entity';

describe('FinanceAlertService', () => {
  describe('getUpcomingDeadlines()', () => {
    it('geeft subscriptions terug waarbij opzegtermijn binnen 14 dagen verstrijkt', () => {
      const today = new Date();

      // sub1: betaaldatum over 20 dagen, opzegtermijn 30 dagen
      // deadline = betaaldatum - 30d = today - 10d → al verstreken → daysUntilDeadline = -10 → ≤ 14 → alert
      const soon = new Date(today);
      soon.setDate(today.getDate() + 20);

      const sub1 = {
        id: '1', naam: 'Netflix', bedrag: 15, interval: 'maandelijks',
        volgendeBetaaldatum: soon.toISOString().slice(0, 10),
        opzegtermijnDagen: 30, actief: true, owner: 'test',
      } as FinanceSubscription;

      // sub2: betaaldatum over 20 dagen, opzegtermijn 5 dagen
      // deadline = betaaldatum - 5d = today + 15d → daysUntilDeadline = 15 → > 14 → geen alert
      const sub2 = {
        id: '2', naam: 'Spotify', bedrag: 10, interval: 'maandelijks',
        volgendeBetaaldatum: soon.toISOString().slice(0, 10),
        opzegtermijnDagen: 5, actief: true, owner: 'test',
      } as FinanceSubscription;

      const svc = new FinanceAlertService({} as never, {} as never);
      const result = (svc as unknown as {
        getUpcomingDeadlines: (subs: FinanceSubscription[]) => FinanceSubscription[]
      }).getUpcomingDeadlines([sub1, sub2]);

      expect(result.map(s => s.id)).toContain('1');
      expect(result.map(s => s.id)).not.toContain('2');
    });
  });
});
