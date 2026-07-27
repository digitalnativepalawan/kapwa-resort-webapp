// ─────────────────────────────────────────────────────────────────────────────
// Single server-side model gateway.
//
// Before this module there were four independent OpenRouter configurations:
//   guest-chat            → settings.openrouter_api_key / settings.openrouter_model
//   resort-operator       → OPENROUTER_API_KEY / OPERATOR_MODEL secrets
//   ops-coordinator       → OPENROUTER_API_KEY / OPS_COORDINATOR_MODEL secrets
//   server/ local runtime → an encrypted local file / OPENROUTER_MODEL
//
// So picking a model in Admin → Agent Settings configured exactly one of them,
// while the others silently fell back to deterministic output or reported the
// model as unavailable.
//
// Resolution order, highest priority first:
//   1. the `settings` row (what Admin → Agent Settings actually writes)
//   2. the role's model-override secret (OPERATOR_MODEL, OPS_COORDINATOR_MODEL…)
//   3. OPENROUTER_API_KEY / a built-in default model
//
// Admin therefore becomes the source of truth, and the secrets remain as a
// deployment-level fallback for functions that run before any settings row
// exists (or when a specific agent is deliberately pinned to another model).
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRole = "guest" | "operator" | "ops-coordinator" | "reservations" | "concierge";

/** Per-role model-override secret, and the default when nothing is configured. */
const ROLE_DEFAULTS: Record<AgentRole, { envKey: string; fallbackModel: string }> = {
  guest: { envKey: "GUEST_MODEL", fallbackModel: "openai/gpt-4o-mini" },
  operator: { envKey: "OPERATOR_MODEL", fallbackModel: "anthropic/claude-haiku-4-5" },
  "ops-coordinator": { envKey: "OPS_COORDINATOR_MODEL", fallbackModel: "anthropic/claude-haiku-4-5" },
  reservations: { envKey: "RESERVATIONS_MODEL", fallbackModel: "anthropic/claude-haiku-4-5" },
  concierge: { envKey: "CONCIERGE_MODEL", fallbackModel: "anthropic/claude-haiku-4-5" },
};

export interface ModelConfig {
  provider: "openrouter" | "ollama";
  apiKey: string | null;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  /** Where the model name came from — surfaced in responses for debugging. */
  source: "settings" | "secret" | "default";
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve the effective model configuration for an agent role.
 * Never throws — a failed settings read degrades to the secret/default path.
 */
export async function resolveModelConfig(
  supabase: { from: (t: string) => any },
  role: AgentRole,
  overrides: { maxTokens?: number; temperature?: number } = {},
): Promise<ModelConfig> {
  const { envKey, fallbackModel } = ROLE_DEFAULTS[role];

  let row: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from("settings")
      .select(
        "openrouter_api_key, openrouter_model, bot_provider, bot_base_url, bot_model, bot_temperature, bot_max_tokens",
      )
      .limit(1)
      .maybeSingle();
    row = data ?? null;
  } catch (error) {
    console.error("[modelGateway] settings read failed, using secrets", error);
  }

  // The guest concierge is the one role that may deliberately run on a local
  // Ollama box (bot_provider), so it honours the bot_* columns.
  const isOllama = role === "guest" && row?.bot_provider === "ollama";
  if (isOllama) {
    return {
      provider: "ollama",
      apiKey: null,
      model: String(row?.bot_model || "qwen2.5:3b"),
      baseUrl: String(row?.bot_base_url || "http://127.0.0.1:11434"),
      temperature: overrides.temperature ?? num(row?.bot_temperature, 0.2),
      maxTokens: overrides.maxTokens ?? num(row?.bot_max_tokens, 500),
      source: "settings",
    };
  }

  const settingsKey = String(row?.openrouter_api_key || "").trim();
  const settingsModel = String(row?.openrouter_model || "").trim();
  const secretModel = (Deno.env.get(envKey) ?? "").trim();

  let model = fallbackModel;
  let source: ModelConfig["source"] = "default";
  if (settingsModel) {
    model = settingsModel;
    source = "settings";
  } else if (secretModel) {
    model = secretModel;
    source = "secret";
  }

  return {
    provider: "openrouter",
    apiKey: settingsKey || (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim() || null,
    model,
    baseUrl: "https://openrouter.ai/api/v1",
    temperature: overrides.temperature ?? num(row?.bot_temperature, 0.2),
    maxTokens: overrides.maxTokens ?? num(row?.bot_max_tokens, 700),
    source,
  };
}

export class ModelUnavailableError extends Error {
  constructor(message = "model_unavailable") {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/**
 * Send a chat completion through the resolved provider.
 * Throws ModelUnavailableError when no key/endpoint is configured, so callers
 * can fall back to their deterministic summaries.
 */
export async function callModel(
  config: ModelConfig,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (config.provider === "ollama") {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    if (!reply) throw new ModelUnavailableError("empty_response");
    return reply;
  }

  if (!config.apiKey) throw new ModelUnavailableError();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("APP_URL") ?? "https://kapwa.local",
      "X-Title": "KAPWA Hospitality OS",
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
  if (!reply) throw new ModelUnavailableError("empty_response");
  return reply;
}
