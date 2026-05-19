/**
 * Vercel Serverless Function: AI Proxy
 * 
 * Proxies requests to OpenRouter API so that API keys are never exposed
 * in the browser. Deploy this alongside the frontend on Vercel.
 * 
 * Environment variables (set in Vercel dashboard, NOT in client code):
 *   OPENROUTER_API_KEY - Your OpenRouter API key
 *   OPENROUTER_MODEL  - Default model (optional, defaults to openrouter/auto)
 * 
 * Usage from client:
 *   POST /api/ai-proxy
 *   Body: { model, messages, temperature }
 */

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(data: any): void;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_BODY_SIZE = 50_000; // 50KB max request body

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting header check (basic — for production use Redis-based rate limiting)
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing OPENROUTER_API_KEY' });
  }

  try {
    const body = req.body;
    if (!body || !body.messages || !Array.isArray(body.messages)) {
      return res.status(400).json({ error: 'Invalid request body: messages array required' });
    }

    // Validate body size to prevent abuse
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > MAX_BODY_SIZE) {
      return res.status(413).json({ error: 'Request body too large' });
    }

    const model = body.model || process.env.OPENROUTER_MODEL || 'openrouter/auto';
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.4;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': req.headers.referer || req.headers.origin || 'https://poshulio.vercel.app',
        'X-Title': 'POSHULIO',
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        temperature,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || `OpenRouter error: ${response.status}`,
        code: response.status,
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[ai-proxy] Error:', error.message);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
}
