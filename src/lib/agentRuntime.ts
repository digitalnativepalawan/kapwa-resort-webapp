// Bridge from the browser to the local KAPWA agent runtime in server/index.js.
// The runtime holds the encrypted provider settings (OpenRouter / Ollama / Hermes)
// and is admin-token protected. Edge functions cannot reach it (it's on the
// operator's machine), so the browser is the join point.

const RUNTIME_URL = (import.meta.env.VITE_AGENT_RUNTIME_URL as string | undefined)?.replace(/\/$/, "") || "";
const ADMIN_TOKEN_KEY = "kapwa_admin_token";

export interface RuntimeSettings {
  enabled: boolean;
  mode: "openrouter" | "ollama" | "hermes";
  openrouterModel: string;
  openrouterConfigured: boolean;
  openrouterKeyMasked: string | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  hermesProvider: "openrouter" | "ollama";
  temperature: number;
  maxTokens: number;
}

export interface RuntimeReply {
  reply: string | null;
  provider: string;
  model: string | null;
  mode?: string;
  error?: string;
}

function adminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

function headers(): Record<string, string> {
  const token = adminToken();
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (token) base["x-kapwa-admin-token"] = token;
  return base;
}

export function isRuntimeConfigured(): boolean {
  return Boolean(RUNTIME_URL);
}

export async function getRuntimeSettings(): Promise<RuntimeSettings | null> {
  if (!RUNTIME_URL) return null;
  try {
    const res = await fetch(`${RUNTIME_URL}/runtime/settings`, { headers: headers() });
    if (!res.ok) return null;
    return (await res.json()) as RuntimeSettings;
  } catch {
    return null;
  }
}

export async function runtimeHealth(): Promise<{ ok: boolean; provider?: string; model?: string; error?: string }> {
  if (!RUNTIME_URL) return { ok: false, error: "Runtime URL is not configured" };
  try {
    const res = await fetch(`${RUNTIME_URL}/hermes/health`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `Runtime returned ${res.status}` };
    return { ok: Boolean(data?.ok), provider: data?.provider, model: data?.model };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function askOperator(params: {
  question: string;
  snapshot: Record<string, unknown>;
  deterministicSummary?: string;
}): Promise<RuntimeReply> {
  if (!RUNTIME_URL) return { reply: null, provider: "deterministic", model: null, error: "runtime_url_missing" };
  if (!adminToken()) return { reply: null, provider: "deterministic", model: null, error: "admin_token_missing" };
  try {
    const res = await fetch(`${RUNTIME_URL}/operator/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { reply: null, provider: "deterministic", model: null, error: data?.error || `Runtime ${res.status}` };
    }
    return {
      reply: typeof data?.reply === "string" ? data.reply : null,
      provider: data?.provider || "deterministic",
      model: data?.model ?? null,
      mode: data?.mode,
    };
  } catch (err) {
    return { reply: null, provider: "deterministic", model: null, error: err instanceof Error ? err.message : String(err) };
  }
}
