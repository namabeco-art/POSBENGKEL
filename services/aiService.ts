export interface OpenRouterRequest {
  apiKey: string;
  userMessage: string;
  systemPrompt: string;
  primaryModel?: string;
  fallbackModel?: string;
  fallbackModels?: string[];
  appName?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 20000;

const getTextFromContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('')
      .trim();
  }
  return '';
};

const normalizeError = (status: number, message: string) => {
  const msg = (message || '').trim();
  let code = `OPENROUTER_ERROR_${status}`;
  if (status === 401 || status === 403) code = 'OPENROUTER_AUTH_ERROR';
  else if (status === 402) code = msg.toLowerCase().includes('quota') ? 'OPENROUTER_CREDIT_ERROR' : 'OPENROUTER_PAYMENT_REQUIRED';
  else if (status === 429) code = 'OPENROUTER_RATE_LIMIT';
  else if (status === 503) code = 'OPENROUTER_PROVIDER_UNAVAILABLE';
  return `${code}::${msg || `HTTP_${status}`}`;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('OPENROUTER_TIMEOUT')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export const parseOpenRouterError = (rawMessage: string) => {
  const [maybeCode, ...rest] = String(rawMessage || '').split('::');
  if (!maybeCode.startsWith('OPENROUTER_')) {
    return { code: 'OPENROUTER_UNKNOWN_ERROR', detail: rawMessage || 'Unknown error' };
  }
  return { code: maybeCode, detail: rest.join('::').trim() };
};

const callOpenRouterModel = async (apiKey: string, model: string, userMessage: string, systemPrompt: string, appName: string) => {
  const response = await withTimeout(fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': globalThis.location?.origin || 'https://poshulio.vercel.app',
      'X-Title': appName,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
    }),
  }), OPENROUTER_TIMEOUT_MS);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeError(response.status, data?.error?.message || 'OpenRouter request failed'));
  }

  const text = getTextFromContent(data?.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error('OPENROUTER_EMPTY_RESPONSE');
  }

  return text;
};

export const requestOpenRouterReply = async ({
  apiKey,
  userMessage,
  systemPrompt,
  primaryModel = 'openrouter/auto',
  fallbackModel = 'openrouter/auto',
  fallbackModels = [],
  appName = 'POSHULIO',
}: OpenRouterRequest) => {
  const parsedFallbacks =
    Array.isArray(fallbackModels) && fallbackModels.length > 0
      ? fallbackModels
      : String(fallbackModel || '')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);

  const models = Array.from(
    new Set([primaryModel, ...parsedFallbacks, 'openrouter/auto'].filter(Boolean)),
  );
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      return await callOpenRouterModel(apiKey, model, userMessage, systemPrompt, appName);
    } catch (error: any) {
      const raw = String(error?.message || '');
      const parsed = parseOpenRouterError(raw);
      if (parsed.code === 'OPENROUTER_AUTH_ERROR' || parsed.code === 'OPENROUTER_CREDIT_ERROR' || parsed.code === 'OPENROUTER_PAYMENT_REQUIRED') {
        throw new Error(`${parsed.code}::${parsed.detail}`);
      }
      lastError = new Error(`${parsed.code}::model=${model}${parsed.detail ? `; ${parsed.detail}` : ''}`);
    }
  }

  throw lastError || new Error('OPENROUTER_UNKNOWN_ERROR');
};

/**
 * Extract text from an image using AI Vision model via OpenRouter.
 * Converts image file to base64 and sends to a vision-capable model.
 * Used for OCR on supplier price list PDFs/images.
 */
export const extractTextFromImage = async ({
  apiKey,
  imageBase64,
  mimeType,
  prompt = 'Extract ALL text from this image. Output the raw text content exactly as shown, preserving numbers and formatting. Focus on product names, codes, and prices.',
  model = 'google/gemini-flash-1.5',
  appName = 'POSHULIO OCR',
}: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  prompt?: string;
  model?: string;
  appName?: string;
}): Promise<string> => {
  if (!apiKey) throw new Error('OPENROUTER_AUTH_ERROR::API key required for OCR');

  const response = await withTimeout(fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': globalThis.location?.origin || 'https://poshulio.vercel.app',
      'X-Title': appName,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  }), 30000); // 30s timeout for vision

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeError(response.status, data?.error?.message || 'Vision OCR failed'));
  }

  const text = getTextFromContent(data?.choices?.[0]?.message?.content);
  if (!text) throw new Error('OPENROUTER_EMPTY_RESPONSE::No text extracted from image');
  return text;
};

/**
 * Convert a File to base64 string.
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:mime;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
