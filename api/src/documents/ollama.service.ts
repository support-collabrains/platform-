import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface IntentResult {
  intent: 'create_task' | 'list_tasks' | 'complete_task' | 'question' | 'agenda' | 'other';
  title?: string | null;
  due_date?: string | null;
  task_number?: number | null;
  confidence: number;
  reply?: string | null;
}

export interface DocumentClassification {
  title: string;
  correspondent: string;
  document_type: string;
  date: string;         // YYYY-MM-DD
  tags: string[];
  storage_path: string;
}

export const DOCUMENT_TYPES = [
  'Financieel', 'Belastingrapport', 'Contracten', 'Abonnementen', 'Verzekeringen',
  'Medisch', 'Voertuigen', 'Onroerend Goed', 'Overheidsaanvragen', 'Bankafschriften',
  'Schuldenoverzicht', 'Begroting', 'Spaaroverzicht', 'Investeringen', 'Pensioen',
  'Betalingsregelingen', 'Dossiers & Akten', 'Correspondenten', 'Notificaties Log',
  'Goedkeuringen', 'Machtigingen', 'Activiteit Log', 'Systeemstatus',
];

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  readonly url: string;
  readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.url = config.get('OLLAMA_URL') ?? 'http://ollama:11434';
    this.model = config.get('OLLAMA_MODEL') ?? 'mistral';
  }

  async classifyDocument(messageText: string, filename?: string): Promise<DocumentClassification> {
    const today = new Date().toISOString().slice(0, 10);
    const fileHint = filename ? `\nBestandsnaam: ${filename}` : '';
    const prompt =
      `Je bent een documentassistent. Zet dit bericht om naar een Paperless-ngx document.` +
      `\n\nBericht: ${messageText.slice(0, 2000)}${fileHint}` +
      `\nVandaag is: ${today}` +
      `\n\nGebruik documenttypes uit deze lijst: ${DOCUMENT_TYPES.join(', ')}.` +
      `\n\nOutput ALLEEN geldig JSON (geen uitleg, geen markdown):` +
      `\n{"title":"...","correspondent":"...","document_type":"...","date":"YYYY-MM-DD","tags":["..."],"storage_path":"..."}`;

    const { data } = await axios.post(
      `${this.url}/api/generate`,
      { model: this.model, prompt, stream: false },
      { timeout: 120_000 },
    );

    const raw = (data.response as string).trim();
    // Extract JSON from the response (model may add surrounding text despite prompt)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Ollama did not return valid JSON: ${raw.slice(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]) as DocumentClassification;
    // Ensure required fields have fallbacks
    return {
      title: parsed.title || filename || 'Onbekend document',
      correspondent: parsed.correspondent || '',
      document_type: parsed.document_type || 'Correspondenten',
      date: parsed.date || today,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      storage_path: parsed.storage_path || '',
    };
  }

  async parseIntent(text: string, lang: string): Promise<IntentResult> {
    const today = new Date().toISOString().slice(0, 10);
    const langHint = lang === 'de' ? 'Deutsch' : lang === 'en' ? 'English' : 'Nederlands';
    const prompt =
      `Je bent een slimme assistent die berichten interpreteert. Vandaag is ${today}. Taal: ${langHint}.\n\n` +
      `Bericht: "${text.slice(0, 500)}"\n\n` +
      `Bepaal de intentie. Antwoord ALLEEN met geldig JSON:\n` +
      `{"intent":"create_task|list_tasks|complete_task|question|agenda|other",` +
      `"title":"taak beschrijving als intent=create_task, anders null",` +
      `"due_date":"YYYY-MM-DD als er een datum in het bericht staat, anders null",` +
      `"task_number": taakNummer als intent=complete_task en nummer duidelijk, anders null,` +
      `"confidence":0.0-1.0,` +
      `"reply":"vriendelijk antwoord als intent=question of other, in taal van bericht, anders null"}`;

    try {
      const { data } = await axios.post(
        `${this.url}/api/generate`,
        { model: this.model, prompt, stream: false },
        { timeout: 30_000 },
      );
      const raw = (data.response as string).trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { intent: 'other', confidence: 0 };
      const parsed = JSON.parse(jsonMatch[0]) as IntentResult;
      return {
        intent: parsed.intent ?? 'other',
        title: parsed.title ?? null,
        due_date: parsed.due_date ?? null,
        task_number: parsed.task_number ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reply: parsed.reply ?? null,
      };
    } catch {
      return { intent: 'other', confidence: 0 };
    }
  }

  async summarize(text: string): Promise<string> {
    const prompt =
      `Vat het volgende document samen in het Nederlands. Wees beknopt (max 300 woorden).\n\n` +
      text.slice(0, 6000);

    const { data } = await axios.post(
      `${this.url}/api/generate`,
      { model: this.model, prompt, stream: false },
      { timeout: 180_000 },
    );

    return (data.response as string).trim();
  }

  async ensureModel(): Promise<void> {
    try {
      this.logger.log(`Pulling Ollama model: ${this.model} (may take several minutes on first run)`);
      await axios.post(`${this.url}/api/pull`, { name: this.model, stream: false }, { timeout: 900_000 });
      this.logger.log(`Ollama model ready: ${this.model}`);
    } catch (err) {
      this.logger.warn(`Ollama pull failed (non-fatal): ${(err as Error).message}`);
    }
  }
}
