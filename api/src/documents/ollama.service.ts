import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly url: string;
  readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.url = config.get('OLLAMA_URL') ?? 'http://ollama:11434';
    this.model = config.get('OLLAMA_MODEL') ?? 'mistral';
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
