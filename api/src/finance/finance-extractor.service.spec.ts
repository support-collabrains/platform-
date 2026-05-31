import { FinanceExtractorService } from './finance-extractor.service';
import { OllamaService } from '../documents/ollama.service';

const mockOllama = {
  url: 'http://ollama:11434',
  model: 'llama3.1:8b',
};

describe('FinanceExtractorService', () => {
  let service: FinanceExtractorService;

  beforeEach(() => {
    service = new FinanceExtractorService(mockOllama as OllamaService);
  });

  describe('parseExtraction()', () => {
    it('parst geldige JSON correct', () => {
      const raw = JSON.stringify({
        leverancier: 'Ziggo',
        bedrag: 49.95,
        datum: '2026-05-01',
        categorie: 'Abonnementen',
        type: 'abonnement',
        interval: 'maandelijks',
        opzegtermijn_dagen: 30,
        confidence: 0.95,
      });
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction(raw);
      expect(result).toMatchObject({ leverancier: 'Ziggo', bedrag: 49.95 });
    });

    it('geeft null bij ongeldige JSON', () => {
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction('geen json hier');
      expect(result).toBeNull();
    });

    it('geeft null als bedrag ontbreekt', () => {
      const raw = JSON.stringify({ leverancier: 'Test', datum: '2026-01-01', categorie: 'Overig', type: 'eenmalig', confidence: 0.5 });
      const result = (service as unknown as { parseExtraction: (s: string) => unknown })
        .parseExtraction(raw);
      expect(result).toBeNull();
    });

    it('normaliseert categorie naar Overig bij onbekende waarde', () => {
      const raw = JSON.stringify({
        leverancier: 'X', bedrag: 10, datum: '2026-01-01',
        categorie: 'OnbekendeCategorie', type: 'eenmalig', confidence: 0.5,
      });
      const result = (service as unknown as { parseExtraction: (s: string) => { categorie: string } })
        .parseExtraction(raw);
      expect(result?.categorie).toBe('Overig');
    });
  });
});
