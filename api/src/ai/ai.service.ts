import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OllamaService } from '../documents/ollama.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly ollama: OllamaService) {}

  async chat(
    username: string,
    messages: { role: string; content: string }[],
    context?: string,
  ): Promise<{ reply: string; model: string }> {
    const systemPrompt =
      `Je bent Diggi Cloud AI assistent voor ${username}. ` +
      `Je helpt met documenten, mail en agenda.` +
      (context ? ` ${context}` : '');

    const payload = {
      model: this.ollama.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: false,
    };

    try {
      const url = (this.ollama as any)['url'] ?? 'http://ollama:11434';
      const { data } = await axios.post(`${url}/api/chat`, payload, {
        timeout: 120_000,
      });
      const reply: string =
        data?.message?.content ?? data?.choices?.[0]?.message?.content ?? '';
      return { reply: reply.trim(), model: this.ollama.model };
    } catch (err) {
      this.logger.warn(`AI chat failed: ${(err as Error).message}`);
      return { reply: 'Sorry, ik kan momenteel geen antwoord geven.', model: this.ollama.model };
    }
  }

  async summarizeText(text: string): Promise<string> {
    try {
      return await this.ollama.summarize(text);
    } catch (err) {
      this.logger.warn(`Summarize failed: ${(err as Error).message}`);
      return '';
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const url = (this.ollama as any)['url'] ?? 'http://ollama:11434';
      const { data } = await axios.get(`${url}/api/tags`, { timeout: 10_000 });
      const models = (data?.models ?? []) as { name: string }[];
      return models.map((m) => m.name);
    } catch (err) {
      this.logger.warn(`Failed to fetch Ollama models: ${(err as Error).message}`);
      return [];
    }
  }
}
