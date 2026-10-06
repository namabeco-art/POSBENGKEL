import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractTextFromImage, getVisionModels, VISION_MODEL_FALLBACKS } from '../services/aiService';

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('OCR vision model', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tidak lagi memakai google/gemini-flash-1.5 yang sudah dihapus dari OpenRouter', () => {
    expect(getVisionModels()).not.toContain('google/gemini-flash-1.5');
    expect(getVisionModels()).toEqual(VISION_MODEL_FALLBACKS);
    expect(getVisionModels('custom/model')[0]).toBe('custom/model');
  });

  it('mencoba model berikutnya jika model pertama tidak tersedia', async () => {
    const requestedModels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model;
      requestedModels.push(model);
      if (requestedModels.length === 1) return jsonResponse(404, { error: { message: 'No endpoints found for model' } });
      return jsonResponse(200, { choices: [{ message: { content: 'Kopi Sachet 12.500' } }] });
    }));

    const text = await extractTextFromImage({ apiKey: 'sk-test-123456', imageBase64: 'AAAA', mimeType: 'image/png' });
    expect(text).toBe('Kopi Sachet 12.500');
    expect(requestedModels).toEqual(VISION_MODEL_FALLBACKS.slice(0, 2));
  });

  it('langsung berhenti jika API key ditolak', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: { message: 'invalid key' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(extractTextFromImage({ apiKey: 'sk-test-123456', imageBase64: 'AAAA', mimeType: 'image/png' })).rejects.toThrow(/OPENROUTER_AUTH_ERROR/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
