import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function encryptionKey() {
  const raw = process.env.KAPWA_SETTINGS_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('KAPWA_SETTINGS_ENCRYPTION_KEY is not configured.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('KAPWA_SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptSecret(value) {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(value) {
  if (!value) return '';
  const payload = Buffer.from(value, 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function askOllama(settings, messages) {
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

export async function askOpenRouter(settings, messages) {
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

export async function runConfiguredModel(settings, messages) {
  if (!settings.enabled) throw new Error('The KAPWA agent runtime is disabled.');
  const provider = settings.mode === 'hermes' ? settings.hermesProvider : settings.mode;
  if (provider === 'openrouter') return askOpenRouter(settings, messages);
  if (provider === 'ollama') return askOllama(settings, messages);
  throw new Error(`Unsupported provider: ${provider}`);
}
