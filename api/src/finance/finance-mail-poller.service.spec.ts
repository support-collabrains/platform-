import { FinanceMailPollerService } from './finance-mail-poller.service';

describe('FinanceMailPollerService', () => {
  let service: FinanceMailPollerService;

  beforeEach(() => {
    service = new FinanceMailPollerService({} as never, {} as never, {} as never, {} as never);
  });

  describe('isFinancialMail()', () => {
    const check = (subject: string, hasAttachment: boolean) =>
      (service as unknown as { isFinancialMail: (s: string, h: boolean) => boolean })
        .isFinancialMail(subject, hasAttachment);

    it('herkent factuur in onderwerp', () => {
      expect(check('Uw factuur van Ziggo', false)).toBe(true);
    });

    it('herkent rekening in onderwerp', () => {
      expect(check('Rekening november 2026', false)).toBe(true);
    });

    it('herkent abonnement in onderwerp', () => {
      expect(check('Uw abonnement wordt verlengd', false)).toBe(true);
    });

    it('herkent PDF bijlage als financieel signaal', () => {
      expect(check('Nieuwsbrief', true)).toBe(true);
    });

    it('negeert gewone mails zonder bijlage', () => {
      expect(check('Hoe gaat het?', false)).toBe(false);
    });
  });
});
