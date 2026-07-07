import express from 'express';
import cors from 'cors';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

let guestPromptCache = null;

async function loadGuestPrompt() {
  if (guestPromptCache) return guestPromptCache;
  try {
    guestPromptCache = await readFile(join(__dirname, 'guest-concierge-system-prompt.md'), 'utf-8');
    return guestPromptCache;
  } catch (error) {
    console.error('[ollama-proxy] guest prompt load error:', error?.message || String(error));
    return 'You are KAPWA, a helpful resort guest concierge. Be concise and never invent prices, policies, availability, or confirmations.';
  }
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMemoryAnswer(message, memory) {
  if (!Array.isArray(memory)) return null;
  const normalizedMessage = normalize(message);

  for (const item of memory) {
    if (!item || item.active === false || !item.answer) continue;

    const question = normalize(item.question);
    if (question && normalizedMessage === question) return String(item.answer).trim();

    const keywords = String(item.keywords || '')
      .split(',')
      .map(normalize)
      .filter(Boolean);

    if (keywords.length > 0 && keywords.every(keyword => normalizedMessage.includes(keyword))) {
      return String(item.answer).trim();
    }
  }

  return null;
}

app.get('/api/hermes/health', async (_req, res) => {
  try {
    const response = await fetch(`${DEFAULT_OLLAMA_URL}/api/tags`);
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const data = await response.json();
    const installed = Array.isArray(data.models)
      ? data.models.some((model) => model.name === DEFAULT_OLLAMA_MODEL)
      : false;
    return res.json({ ok: true, provider: 'ollama', model: DEFAULT_OLLAMA_MODEL, installed });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      provider: 'ollama',
      model: DEFAULT_OLLAMA_MODEL,
      error: error?.message || 'Ollama is unavailable',
    });
  }
});

app.post('/api/hermes/chat', async (req, res) => {
  const { message, context, settings = {}, memory = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (settings.enabled === false) {
    return res.status(503).json({ error: 'The local guest bot is disabled in Admin settings.' });
  }

  const memoryReply = findMemoryAnswer(message, memory);
  if (memoryReply) {
    return res.json({ reply: memoryReply, source: 'faq-memory' });
  }

  const ollamaUrl = typeof settings.baseUrl === 'string' && settings.baseUrl.trim()
    ? settings.baseUrl.trim().replace(/\/$/, '')
    : DEFAULT_OLLAMA_URL;
  const model = typeof settings.model === 'string' && settings.model.trim()
    ? settings.model.trim()
    : DEFAULT_OLLAMA_MODEL;
  const temperature = Number.isFinite(Number(settings.temperature))
    ? Math.min(1, Math.max(0, Number(settings.temperature)))
    : 0.2;
  const maxTokens = Number.isFinite(Number(settings.maxTokens))
    ? Math.min(500, Math.max(40, Number(settings.maxTokens)))
    : 180;

  try {
    const normalizedContext = typeof context === 'string' ? context.toLowerCase().trim() : '';
    const messages = [];
    if (normalizedContext === 'guest-concierge') {
      messages.push({ role: 'system', content: await loadGuestPrompt() });
    }
    messages.push({ role: 'user', content: message.trim() });

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${detail}`);
    }

    const data = await response.json();
    const reply = data?.message?.content?.trim();
    if (!reply) throw new Error('Ollama returned an empty response');

    return res.json({ reply, source: 'ollama', model });
  } catch (error) {
    console.error('[ollama-proxy] chat error:', error);
    return res.status(503).json({
      error: 'Local AI is unavailable. Make sure Ollama is running on this laptop.',
    });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`KAPWA Ollama proxy listening on http://localhost:${port}`);
  console.log(`Default model ${DEFAULT_OLLAMA_MODEL} at ${DEFAULT_OLLAMA_URL}`);
});
