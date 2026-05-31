import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OllamaService } from '../documents/ollama.service';
import { ExtractedTransaction } from './finance.dto';
import { FINANCE_CATEGORIEEN, FinanceCategorie } from './finance.entity';

@Injectable()
export class FinanceExtractorService {
  private readonly logger = new Logger(FinanceExtractorService.name);

  constructor(private readonly ollama: OllamaService) {}

  async extract(text: string): Promise<ExtractedTransaction | null> {
    const today = new Date().toISOString().slice(0, 10);
    const prompt =
      `Je bent een financieel assistent. Extraheer factuur/abonnement-gegevens uit onderstaande tekst.\n` +
      `Vandaag is ${today}. Categorieën: ${FINANCE_CATEGORIEEN.join(', ')}.\n` +
      `Geef ALLEEN geldig JSON terug, geen uitleg:\n` +
      `{"leverancier":"...","bedrag":0.00,"datum":"YYYY-MM-DD","categorie":"...","type":"eenmalig|abonnement",` +
      `"interval":"maandelijks|kwartaal|jaarlijks","opzegtermijn_dagen":30,"confidence":0.0}\n\n` +
      `Tekst:\n${text.slice(0, 3000)}`;

    try {
      const { data } = await axios.post(
        `${this.ollama.url}/api/generate`,
        { model: this.ollama.model, prompt, stream: false },
        { timeout: 60_000 },
      );
      return this.parseExtraction((data.response as string).trim());
    } catch (err) {
      this.logger.warn(`Ollama extractie mislukt: ${(err as Error).message}`);
      return null;
    }
  }

  private parseExtraction(raw: string): ExtractedTransaction | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as Partial<ExtractedTransaction>;
      if (!parsed.leverancier || parsed.bedrag == null || !parsed.datum) return null;
      if (!FINANCE_CATEGORIEEN.includes(parsed.categorie as FinanceCategorie)) {
        parsed.categorie = 'Overig';
      }
      return {
        leverancier: parsed.leverancier,
        bedrag: Number(parsed.bedrag),
        datum: parsed.datum,
        categorie: (parsed.categorie as FinanceCategorie) ?? 'Overig',
        type: parsed.type === 'abonnement' ? 'abonnement' : 'eenmalig',
        interval: parsed.interval,
        opzegtermijnDagen: (parsed as Record<string,unknown>)['opzegtermijn_dagen'] as number | undefined,
        confidence: parsed.confidence ?? 0.5,
      };
    } catch {
      return null;
    }
  }
}
