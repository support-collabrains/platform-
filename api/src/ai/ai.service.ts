import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';
import { OllamaService } from '../documents/ollama.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly ollama: OllamaService) {}

  private systemPrompt(username: string, context?: string): string {
    return (
      `Je bent Diggi Cloud AI assistent voor ${username}. ` +
      `Je helpt met documenten, mail en agenda.` +
      (context ? ` ${context}` : '')
    );
  }

  async chat(
    username: string,
    messages: { role: string; content: string }[],
    context?: string,
  ): Promise<{ reply: string; model: string }> {
    const payload = {
      model: this.ollama.model,
      messages: [{ role: 'system', content: this.systemPrompt(username, context) }, ...messages],
      stream: false,
    };

    try {
      const { data } = await axios.post(`${this.ollama.url}/api/chat`, payload, {
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

  async chatStream(
    username: string,
    messages: { role: string; content: string }[],
    context: string | undefined,
    res: Response,
  ): Promise<void> {
    const payload = {
      model: this.ollama.model,
      messages: [{ role: 'system', content: this.systemPrompt(username, context) }, ...messages],
      stream: true,
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const response = await axios.post(`${this.ollama.url}/api/chat`, payload, {
        responseType: 'stream',
        timeout: 120_000,
      });

      let buf = '';
      response.data.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            const token: string = json?.message?.content ?? '';
            if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
            if (json.done) {
              res.write('data: [DONE]\n\n');
              res.end();
            }
          } catch { /* skip malformed line */ }
        }
      });

      response.data.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
      });

      response.data.on('error', (err: Error) => {
        this.logger.warn(`Ollama stream error: ${err.message}`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    } catch (err) {
      this.logger.warn(`AI chatStream failed: ${(err as Error).message}`);
      res.write(`data: ${JSON.stringify({ token: 'Sorry, ik kan momenteel geen antwoord geven.' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
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
      const { data } = await axios.get(`${this.ollama.url}/api/tags`, { timeout: 10_000 });
      const models = (data?.models ?? []) as { name: string }[];
      return models.map((m) => m.name);
    } catch (err) {
      this.logger.warn(`Failed to fetch Ollama models: ${(err as Error).message}`);
      return [];
    }
  }
}
