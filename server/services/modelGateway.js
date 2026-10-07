/**
 * KAPWA Hospitality OS — Unified Server-Side Model Gateway (Node/Express)
 *
 * Resolves model configuration from the `settings` table in Neon PostgreSQL / Embedded Store,
 * falling back to environment variables (`OPENROUTER_API_KEY`, `OPERATOR_MODEL`, etc.).
 */

const ROLE_DEFAULTS = {
  guest: { envKey: 'GUEST_MODEL', fallbackModel: 'openai/gpt-4o-mini' },
  operator: { envKey: 'OPERATOR_MODEL', fallbackModel: 'anthropic/claude-haiku-4-5' },
  'ops-coordinator': { envKey: 'OPS_COORDINATOR_MODEL', fallbackModel: 'anthropic/claude-haiku-4-5' },
  reservations: { envKey: 'RESERVATIONS_MODEL', fallbackModel: 'anthropic/claude-haiku-4-5' },
  concierge: { envKey: 'CONCIERGE_MODEL', fallbackModel: 'anthropic/claude-haiku-4-5' },
};

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function resolveModelConfig(db, role = 'operator', overrides = {}) {
  const { envKey, fallbackModel } = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operator;

  let row = null;
  try {
    const { data } = await db
      .from('settings')
      .select(
        'openrouter_api_key, openrouter_model, bot_provider, bot_base_url, bot_model, bot_temperature, bot_max_tokens',
      )
      .limit(1)
      .maybeSingle();
    row = data ?? null;
  } catch (err) {
    console.error('[modelGateway] settings read failed, using env fallback:', err.message);
  }

  const isOllama = role === 'guest' && row?.bot_provider === 'ollama';
  if (isOllama) {
    return {
      provider: 'ollama',
      apiKey: null,
      model: String(row?.bot_model || 'qwen2.5:3b'),
      baseUrl: String(row?.bot_base_url || 'http://127.0.0.1:11434'),
      temperature: overrides.temperature ?? num(row?.bot_temperature, 0.2),
      maxTokens: overrides.maxTokens ?? num(row?.bot_max_tokens, 500),
      source: 'settings',
    };
  }

  const settingsKey = String(row?.openrouter_api_key || '').trim();
  const settingsModel = String(row?.openrouter_model || '').trim();
  const secretModel = String(process.env[envKey] || '').trim();

  let model = fallbackModel;
  let source = 'default';
  if (settingsModel) {
    model = settingsModel;
    source = 'settings';
  } else if (secretModel) {
    model = secretModel;
    source = 'secret';
  }

  return {
    provider: 'openrouter',
    apiKey: settingsKey || String(process.env.OPENROUTER_API_KEY || '').trim() || null,
    model,
    baseUrl: 'https://openrouter.ai/api/v1',
    temperature: overrides.temperature ?? num(row?.bot_temperature, 0.2),
    maxTokens: overrides.maxTokens ?? num(row?.bot_max_tokens, 700),
    source,
  };
}

export class ModelUnavailableError extends Error {
  constructor(message = 'model_unavailable') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export async function callModel(config, messages) {
  if (config.provider === 'ollama') {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: { temperature: config.temperature, num_predict: config.maxTokens },
      }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const reply = data?.message?.content?.trim();
    if (!reply) throw new ModelUnavailableError('empty_response');
    return reply;
  }

  if (!config.apiKey) throw new ModelUnavailableError();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://kapwa.local',
      'X-Title': 'KAPWA Hospitality OS',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new ModelUnavailableError('empty_response');
  return reply;
}

export async function callModelWithTools(config, messages, tools) {
  if (config.provider === 'ollama') {
    const content = await callModel(config, messages);
    return { content, tool_calls: [], supportsTools: false };
  }

  if (!config.apiKey) throw new ModelUnavailableError();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://kapwa.local',
      'X-Title': 'KAPWA Hospitality OS',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    if (response.status === 400 && /tool|function/i.test(text)) {
      return { content: '', tool_calls: [], supportsTools: false };
    }
    throw new Error(`OpenRouter ${response.status}: ${text}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message ?? {};
  return {
    content: typeof message.content === 'string' ? message.content.trim() : '',
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    supportsTools: true,
  };
}
