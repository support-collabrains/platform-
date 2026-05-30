// Covers: chat (system prompt includes username, optional context, message/choices response paths,
// fallback on error, stream:false, correct model name returned),
// summarizeText (delegates to OllamaService.summarize, empty string on failure),
// getModels (extracts name list from tags response, empty array on error or missing field)

import axios from 'axios';
import { AiService } from './ai.service';
import { OllamaService } from '../documents/ollama.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeOllama(overrides: Partial<OllamaService> = {}): OllamaService {
  return {
    model: 'mistral',
    summarize: jest.fn().mockResolvedValue('summary result'),
    ensureModel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OllamaService;
}

function makeService(ollama?: OllamaService): AiService {
  return new AiService(ollama ?? makeOllama());
}

describe('AiService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('chat()', () => {
    it('includes username in system prompt', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: 'hallo' } } });
      await makeService().chat('alice', []);
      const payload = mockedAxios.post.mock.calls[0][1] as { messages: { role: string; content: string }[] };
      expect(payload.messages[0].content).toContain('alice');
    });

    it('system message has role "system"', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      await makeService().chat('bob', []);
      const payload = mockedAxios.post.mock.calls[0][1] as { messages: { role: string }[] };
      expect(payload.messages[0].role).toBe('system');
    });

    it('appends context to system prompt when provided', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      await makeService().chat('bob', [], 'extra context');
      const payload = mockedAxios.post.mock.calls[0][1] as { messages: { content: string }[] };
      expect(payload.messages[0].content).toContain('extra context');
    });

    it('omits extra content when context is not provided', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      await makeService().chat('bob', []);
      const payload = mockedAxios.post.mock.calls[0][1] as { messages: { content: string }[] };
      const sysContent = payload.messages[0].content;
      expect(sysContent.endsWith('agenda.')).toBe(true);
    });

    it('forwards caller messages after system message', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      await makeService().chat('u', [{ role: 'user', content: 'hello' }]);
      const payload = mockedAxios.post.mock.calls[0][1] as { messages: { role: string; content: string }[] };
      expect(payload.messages[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('sets stream:false in payload', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      await makeService().chat('u', []);
      const payload = mockedAxios.post.mock.calls[0][1] as { stream: boolean };
      expect(payload.stream).toBe(false);
    });

    it('returns trimmed reply from data.message.content', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '  hello  ' } } });
      const { reply } = await makeService().chat('u', []);
      expect(reply).toBe('hello');
    });

    it('falls back to choices[0].message.content when message field is absent', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'choice reply' } }] } });
      const { reply } = await makeService().chat('u', []);
      expect(reply).toBe('choice reply');
    });

    it('returns Dutch fallback message on network error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('timeout'));
      const { reply } = await makeService().chat('u', []);
      expect(reply).toContain('momenteel');
    });

    it('does not throw on network error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('conn refused'));
      await expect(makeService().chat('u', [])).resolves.toBeDefined();
    });

    it('returns ollama.model in the model field', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      const ollama = makeOllama({ model: 'llama3' } as Partial<OllamaService>);
      const { model } = await makeService(ollama).chat('u', []);
      expect(model).toBe('llama3');
    });

    it('includes ollama.model in the POST payload', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { message: { content: '' } } });
      const ollama = makeOllama({ model: 'phi3' } as Partial<OllamaService>);
      await makeService(ollama).chat('u', []);
      const payload = mockedAxios.post.mock.calls[0][1] as { model: string };
      expect(payload.model).toBe('phi3');
    });
  });

  describe('summarizeText()', () => {
    it('delegates to ollama.summarize', async () => {
      const ollama = makeOllama({ summarize: jest.fn().mockResolvedValue('nice summary') } as Partial<OllamaService>);
      const result = await makeService(ollama).summarizeText('doc text');
      expect(result).toBe('nice summary');
      expect(ollama.summarize).toHaveBeenCalledWith('doc text');
    });

    it('returns empty string when ollama.summarize throws', async () => {
      const ollama = makeOllama({ summarize: jest.fn().mockRejectedValue(new Error('err')) } as Partial<OllamaService>);
      const result = await makeService(ollama).summarizeText('text');
      expect(result).toBe('');
    });

    it('does not throw on ollama failure', async () => {
      const ollama = makeOllama({ summarize: jest.fn().mockRejectedValue(new Error('fail')) } as Partial<OllamaService>);
      await expect(makeService(ollama).summarizeText('text')).resolves.toBeDefined();
    });
  });

  describe('getModels()', () => {
    it('returns model names from Ollama /api/tags response', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { models: [{ name: 'mistral' }, { name: 'llama3' }] } });
      const models = await makeService().getModels();
      expect(models).toEqual(['mistral', 'llama3']);
    });

    it('returns empty array when models field is missing', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: {} });
      const models = await makeService().getModels();
      expect(models).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));
      const models = await makeService().getModels();
      expect(models).toEqual([]);
    });

    it('does not throw on network error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('conn refused'));
      await expect(makeService().getModels()).resolves.toBeDefined();
    });

    it('GETs /api/tags endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { models: [] } });
      await makeService().getModels();
      expect(mockedAxios.get.mock.calls[0][0]).toContain('/api/tags');
    });
  });
});
