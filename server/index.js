import express from 'express';
import cors from 'cors';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const SETTINGS_PATH = process.env.KAPWA_AGENT_SETTINGS_PATH || join(DATA_DIR, 'agent-settings.json');
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const defaultRuntimeSettings = {
  enabled: true,
  mode: 'ollama',
  openrouterModel: DEFAULT_OPENROUTER_MODEL,
  openrouterKeyEncrypted: '',
  ollamaBaseUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  hermesProvider: 'ollama',
  temperature: 0.2,
  maxTokens: 500,
};

let guestPromptCache = null;

function requireAdmin(req, res, next) {
  const expected = process.env.KAPWA_ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: 'KAPWA_ADMIN_TOKEN is not configured.' });
  if (req.header('x-kapwa-admin-token') !== expected) return res.status(401).json({ error: 'Invalid admin token.' });
  return next();
}

function encryptionKey() {
  const raw = process.env.KAPWA_SETTINGS_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('KAPWA_SETTINGS_ENCRYPTION_KEY is not configured.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('KAPWA_SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

function encryptSecret(value) {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptSecret(value) {
  if (!value) return '';
  const payload = Buffer.from(value, 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function loadRuntimeSettings() {
  try {
    const saved = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
    return { ...defaultRuntimeSettings, ...saved };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...defaultRuntimeSettings };
    throw error;
  }
}

async function saveRuntimeSettings(settings) {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  const temp = `${SETTINGS_PATH}.tmp`;
  await writeFile(temp, JSON.stringify(settings, null, 2), 'utf8');
  await rename(temp, SETTINGS_PATH);
}

function publicSettings(settings) {
  let configured = false;
  let masked = null;
  try {
    const key = decryptSecret(settings.openrouterKeyEncrypted);
    configured = Boolean(key);
    masked = key ? `••••••••${key.slice(-4)}` : null;
  } catch {
    configured = false;
  }
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    openrouterModel: settings.openrouterModel,
    openrouterConfigured: configured,
    openrouterKeyMasked: masked,
    ollamaBaseUrl: settings.ollamaBaseUrl,
    ollamaModel: settings.ollamaModel,
    hermesProvider: settings.hermesProvider,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  };
}

async function loadGuestPrompt() {
  if (guestPromptCache) return guestPromptCache;
  try {
    guestPromptCache = await readFile(join(__dirname, 'guest-concierge-system-prompt.md'), 'utf8');
    return guestPromptCache;
  } catch (error) {
    console.error('[agent] guest prompt load error:', error?.message || String(error));
    return 'You are KAPWA, a helpful resort guest concierge. Never invent prices, policies, availability, or confirmations.';
  }
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findMemoryAnswer(message, memory) {
  if (!Array.isArray(memory)) return null;
  const normalizedMessage = normalize(message);
  for (const item of memory) {
    if (!item || item.active === false || !item.answer) continue;
    const question = normalize(item.question);
    if (question && normalizedMessage === question) return String(item.answer).trim();
    const keywords = String(item.keywords || '').split(',').map(normalize).filter(Boolean);
    if (keywords.some(keyword => normalizedMessage.includes(keyword))) return String(item.answer).trim();
  }
  return null;
}

async function askOllama(settings, messages) {
  const baseUrl = String(settings.ollamaBaseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  const model = settings.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: '30m',
      options: { temperature: settings.temperature, num_predict: settings.maxTokens },
    }),
  });
  if (!response.ok) throw new Error(`Ollama ${model} returned ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error(`Ollama ${model} returned an empty response.`);
  return { reply, provider: 'ollama', model };
}

async function askOpenRouter(settings, messages) {
  const apiKey = decryptSecret(settings.openrouterKeyEncrypted);
  if (!apiKey) throw new Error('OpenRouter is not configured.');
  const model = settings.openrouterModel || DEFAULT_OPENROUTER_MODEL;
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.KAPWA_APP_URL || 'http://localhost:5173',
      'X-Title': 'KAPWA Hospitality OS',
    },
    body: JSON.stringify({ model, messages, temperature: settings.temperature, max_tokens: settings.maxTokens }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error(`OpenRouter ${model} returned an empty response.`);
  return { reply, provider: 'openrouter', model };
}

async function runConfiguredModel(settings, messages) {
  if (!settings.enabled) throw new Error('The KAPWA agent runtime is disabled.');
  const provider = settings.mode === 'hermes' ? settings.hermesProvider : settings.mode;
  if (provider === 'openrouter') return askOpenRouter(settings, messages);
  if (provider === 'ollama') return askOllama(settings, messages);
  throw new Error(`Unsupported provider: ${provider}`);
}

app.get('/api/runtime/settings', requireAdmin, async (_req, res) => {
  try {
    return res.json(publicSettings(await loadRuntimeSettings()));
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load runtime settings.' });
  }
});

app.put('/api/runtime/settings', requireAdmin, async (req, res) => {
  try {
    const current = await loadRuntimeSettings();
    const body = req.body || {};
    const mode = ['openrouter', 'ollama', 'hermes'].includes(body.mode) ? body.mode : current.mode;
    const hermesProvider = ['openrouter', 'ollama'].includes(body.hermesProvider) ? body.hermesProvider : current.hermesProvider;
    const next = {
      ...current,
      enabled: body.enabled !== false,
      mode,
      openrouterModel: String(body.openrouterModel || current.openrouterModel),
      ollamaBaseUrl: String(body.ollamaBaseUrl || current.ollamaBaseUrl).replace(/\/$/, ''),
      ollamaModel: String(body.ollamaModel || current.ollamaModel),
      hermesProvider,
      temperature: Math.max(0, Math.min(1, Number(body.temperature ?? current.temperature))),
      maxTokens: Math.max(80, Math.min(2000, Number(body.maxTokens ?? current.maxTokens))),
    };
    if (typeof body.openrouterApiKey === 'string' && body.openrouterApiKey.trim()) {
      next.openrouterKeyEncrypted = encryptSecret(body.openrouterApiKey.trim());
    }
    await saveRuntimeSettings(next);
    return res.json(publicSettings(next));
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Could not save runtime settings.' });
  }
});

app.get('/api/providers/openrouter/models', requireAdmin, async (_req, res) => {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`);
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}.`);
    const payload = await response.json();
    const models = (payload.data || []).map(model => ({
      id: model.id,
      name: model.name || model.id,
      free: Number(model.pricing?.prompt || 0) === 0 && Number(model.pricing?.completion || 0) === 0,
      contextLength: model.context_length || null,
    })).sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
    return res.json({ models });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Could not load OpenRouter models.' });
  }
});

app.post('/api/providers/ollama/detect', requireAdmin, async (req, res) => {
  const baseUrl = String(req.body?.baseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
    const payload = await response.json();
    return res.json({ available: true, models: (payload.models || []).map(model => model.name).filter(Boolean) });
  } catch (error) {
    return res.status(503).json({ available: false, models: [], error: error?.message || 'Ollama is unavailable.' });
  }
});

app.get('/api/hermes/health', async (_req, res) => {
  try {
    const settings = await loadRuntimeSettings();
    const provider = settings.mode === 'hermes' ? settings.hermesProvider : settings.mode;
    if (provider === 'ollama') {
      const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`);
      if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
      const data = await response.json();
      const names = Array.isArray(data.models) ? data.models.map(model => model.name) : [];
      return res.json({ ok: true, mode: settings.mode, provider, model: settings.ollamaModel, installed: names.includes(settings.ollamaModel) });
    }
    return res.json({ ok: Boolean(decryptSecret(settings.openrouterKeyEncrypted)), mode: settings.mode, provider, model: settings.openrouterModel });
  } catch (error) {
    return res.status(503).json({ ok: false, error: error?.message || 'Agent runtime is unavailable.' });
  }
});

app.post('/api/hermes/chat', async (req, res) => {
  const { message, context, memory = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message is required' });
  const memoryReply = findMemoryAnswer(message, memory);
  if (memoryReply) return res.json({ reply: memoryReply, source: 'faq-memory' });

  try {
    const settings = await loadRuntimeSettings();
    const messages = [];
    if (String(context || '').toLowerCase().trim() === 'guest-concierge') messages.push({ role: 'system', content: await loadGuestPrompt() });
    messages.push({ role: 'user', content: message.trim() });
    const result = await runConfiguredModel(settings, messages);
    return res.json({ ...result, mode: settings.mode });
  } catch (error) {
    console.error('[agent] guest chat error:', error?.message || error);
    return res.status(503).json({ error: error?.message || 'The configured AI runtime is unavailable.' });
  }
});

app.post('/api/operator/chat', requireAdmin, async (req, res) => {
  const { question, snapshot, deterministicSummary } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'question is required' });
  if (!snapshot || typeof snapshot !== 'object') return res.status(400).json({ error: 'snapshot is required' });

  const system = `You are the KAPWA Resort Operator for a real hospitality business. Analyze only the supplied operational snapshot. Do not invent guests, bookings, amounts, room states, or completed actions. Never claim an action was executed. Separate urgent risks, today's priorities, and recommended next actions. Booking changes, pricing, refunds, payments, outbound messages, and deletions always require human approval. Keep the answer concise and operational.`;
  const prompt = `Manager question: ${question}\n\nDeterministic system summary: ${deterministicSummary || 'Not supplied'}\n\nOperational snapshot JSON:\n${JSON.stringify(snapshot)}`;

  try {
    const settings = await loadRuntimeSettings();
    const result = await runConfiguredModel(settings, [{ role: 'system', content: system }, { role: 'user', content: prompt }]);
    return res.json({ ...result, mode: settings.mode });
  } catch (error) {
    console.error('[agent] operator chat error:', error?.message || error);
    return res.status(503).json({ error: error?.message || 'The configured AI runtime is unavailable.' });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`KAPWA Agent Runtime listening on http://localhost:${port}`);
  console.log('Modes: OpenRouter, local Ollama, or Hermes Agent');
});
