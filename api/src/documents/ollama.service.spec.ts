// Covers: summarize (truncates to 6000 chars, Dutch prompt, trims response),
// ensureModel (non-fatal — logs warning but does not throw on failure)

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeService(overrides: Record<string, string> = {}): OllamaService {
  const cfg: Record<string, string> = {
    OLLAMA_URL: 'http://ollama:11434',
    OLLAMA_MODEL: 'mistral',
    ...overrides,
  };
  return new OllamaService({ get: (k: string) => cfg[k] ?? '' } as unknown as ConfigService);
}

describe('OllamaService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('summarize()', () => {
    it('POSTs to /api/generate with model, prompt, stream:false', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { response: '  Summary text  ' } });
      const svc = makeService();
      await svc.summarize('document text');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://ollama:11434/api/generate',
        expect.objectContaining({ model: 'mistral', stream: false }),
        expect.any(Object),
      );
    });

    it('starts Dutch prompt', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { response: '' } });
      const svc = makeService();
      await svc.summarize('input');
      const payload = (mockedAxios.post.mock.calls[0][1] as { prompt: string });
      expect(payload.prompt).toMatch(/^Vat het volgende document samen/);
    });

    it('truncates text to 6000 chars in prompt', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { response: '' } });
      const svc = makeService();
      const long = 'x'.repeat(10_000);
      await svc.summarize(long);
      const payload = (mockedAxios.post.mock.calls[0][1] as { prompt: string });
      // prompt = header + text.slice(0, 6000)
      expect(payload.prompt.endsWith('x'.repeat(6000))).toBe(true);
    });

    it('trims whitespace from response', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { response: '  trimmed  ' } });
      const result = await makeService().summarize('text');
      expect(result).toBe('trimmed');
    });

    it('uses configured model name', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { response: '' } });
      await makeService({ OLLAMA_MODEL: 'llama3' }).summarize('text');
      expect((mockedAxios.post.mock.calls[0][1] as { model: string }).model).toBe('llama3');
    });
  });

  describe('ensureModel()', () => {
    it('POSTs to /api/pull with model name', async () => {
      mockedAxios.post.mockResolvedValueOnce({});
      await makeService().ensureModel();
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://ollama:11434/api/pull',
        { name: 'mistral', stream: false },
        expect.any(Object),
      );
    });

    it('does not throw when pull fails (non-fatal)', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('connection refused'));
      await expect(makeService().ensureModel()).resolves.toBeUndefined();
    });
  });
});
