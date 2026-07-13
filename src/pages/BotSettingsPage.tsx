import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Save, Trash2, ArrowLeft, Download, Upload, RefreshCw, Loader2, Wifi, WifiOff, Search, Pencil, X } from 'lucide-react';

type FaqItem = {
  id: string;
  question: string;
  keywords: string;
  answer: string;
  active: boolean;
  sort_order?: number;
};

const FAQ_KEY = 'kapwa_bot_faq_memory';

function normalizeFaq(item: any): FaqItem | null {
  if (!item || typeof item.question !== 'string' || typeof item.answer !== 'string') return null;
  const question = item.question.trim();
  const answer = item.answer.trim();
  if (!question || !answer) return null;
  return {
    id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
    question,
    keywords: typeof item.keywords === 'string' ? item.keywords.trim() : '',
    answer,
    active: item.active !== false,
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 0,
  };
}

interface OpenRouterModel {
  id: string;
  name: string;
  free: boolean;
  contextLength: number | null;
}

const FALLBACK_OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', free: false, contextLength: 128000 },
  { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o', free: false, contextLength: 128000 },
  { id: 'google/gemini-2.0-flash-001', name: 'Google: Gemini 2.0 Flash', free: false, contextLength: 1048576 },
  { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', free: false, contextLength: 1048576 },
  { id: 'anthropic/claude-sonnet-4', name: 'Anthropic: Claude Sonnet 4', free: false, contextLength: 200000 },
  { id: 'meta-llama/llama-4-scout', name: 'Meta: Llama 4 Scout', free: false, contextLength: 131072 },
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek: Chat V3 (free)', free: true, contextLength: 131072 },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B (free)', free: true, contextLength: 131072 },
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', free: true, contextLength: 131072 },
  { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen: Qwen3 235B (free)', free: true, contextLength: 131072 },
];

export default function BotSettingsPage() {
  const navigate = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);

  // Runtime settings from server
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);
  const [provider, setProvider] = useState<'ollama' | 'openrouter' | 'hermes'>('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:3b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaDetecting, setOllamaDetecting] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);

  const [openrouterKey, setOpenrouterKey] = useState('');
  const [openrouterKeyMasked, setOpenrouterKeyMasked] = useState<string | null>(null);
  const [openrouterModel, setOpenrouterModel] = useState('openai/gpt-4o-mini');
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [openrouterLoading, setOpenrouterLoading] = useState(false);
  const [openrouterSearch, setOpenrouterSearch] = useState('');
  const [showFreeOnly, setShowFreeOnly] = useState(false);

  const [hermesSubProvider, setHermesSubProvider] = useState<'ollama' | 'openrouter'>('ollama');

  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(500);
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // FAQ state
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [form, setForm] = useState({ question: '', keywords: '', answer: '' });
  const [loading, setLoading] = useState(true);

  const activeCount = useMemo(() => faqs.filter(item => item.active).length, [faqs]);

  // ── Load settings from Supabase ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase.from('settings') as any)
          .select('bot_enabled, bot_provider, bot_base_url, bot_model, bot_temperature, bot_max_tokens, openrouter_api_key, openrouter_model, hermes_sub_provider')
          .limit(1)
          .maybeSingle();
        if (data) {
          setProvider(data.bot_provider || 'ollama');
          setOllamaUrl(data.bot_base_url || 'http://127.0.0.1:11434');
          setOllamaModel(data.bot_model || 'qwen2.5:3b');
          setOpenrouterModel(data.openrouter_model || 'openai/gpt-4o-mini');
          if (data.openrouter_api_key) {
            setOpenrouterKeyMasked(`••••••••${data.openrouter_api_key.slice(-4)}`);
          }
          setHermesSubProvider(data.hermes_sub_provider || 'ollama');
          setTemperature(Number(data.bot_temperature ?? 0.2));
          setMaxTokens(Number(data.bot_max_tokens ?? 500));
          setAgentEnabled(data.bot_enabled !== false);
        }
      } catch {
        // Column may not exist yet — keep defaults
      } finally {
        setRuntimeLoaded(true);
      }
    })();
  }, []);

  // ── Auto-detect Ollama models (calls Ollama directly from browser) ────────
  const detectOllama = async (url?: string) => {
    const baseUrl = (url || ollamaUrl).replace(/\/$/, '');
    setOllamaDetecting(true);
    setOllamaAvailable(null);
    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m: any) => m.name).filter(Boolean);
      if (models.length > 0) {
        setOllamaModels(models);
        setOllamaAvailable(true);
        if (!models.includes(ollamaModel)) {
          setOllamaModel(models[0]);
        }
      } else {
        setOllamaModels([]);
        setOllamaAvailable(false);
      }
    } catch {
      setOllamaModels([]);
      setOllamaAvailable(false);
    } finally {
      setOllamaDetecting(false);
    }
  };

  // Auto-detect on first load if ollama
  useEffect(() => {
    if (provider === 'ollama' && runtimeLoaded) {
      detectOllama();
    }
  }, [runtimeLoaded, provider]);

  // ── Load OpenRouter models (calls OpenRouter directly from browser) ────────
  useEffect(() => {
    if (provider !== 'openrouter' || !runtimeLoaded) return;
    let cancelled = false;
    (async () => {
      setOpenrouterLoading(true);
      try {
        const headers: Record<string, string> = { 'HTTP-Referer': window.location.origin, 'X-Title': 'KAPWA' };
        if (openrouterKey.trim()) {
          headers['Authorization'] = `Bearer ${openrouterKey.trim()}`;
        }
        const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
        if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
        const payload = await res.json();
        const models = (payload.data || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          free: Number(m.pricing?.prompt || 0) === 0 && Number(m.pricing?.completion || 0) === 0,
          contextLength: m.context_length || null,
        })).sort((a: any, b: any) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
        if (!cancelled) setOpenrouterModels(models.length > 0 ? models : FALLBACK_OPENROUTER_MODELS);
      } catch {
        if (!cancelled) setOpenrouterModels(FALLBACK_OPENROUTER_MODELS);
      } finally {
        if (!cancelled) setOpenrouterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [provider, runtimeLoaded, openrouterKey]);

  // ── Filtered OpenRouter models ─────────────────────────────────────────────
  const filteredOpenRouterModels = useMemo(() => {
    let list = openrouterModels;
    if (showFreeOnly) list = list.filter(m => m.free);
    if (openrouterSearch) {
      const q = openrouterSearch.toLowerCase();
      list = list.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }
    return list;
  }, [openrouterModels, showFreeOnly, openrouterSearch]);

  // ── Save settings to Supabase ──────────────────────────────────────────────
  const saveRuntimeSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        bot_enabled: agentEnabled,
        bot_provider: provider,
        bot_base_url: ollamaUrl.replace(/\/$/, ''),
        bot_model: provider === 'ollama' ? ollamaModel : openrouterModel,
        bot_temperature: temperature,
        bot_max_tokens: maxTokens,
        openrouter_model: openrouterModel,
        hermes_sub_provider: hermesSubProvider,
      };
      if (provider === 'openrouter' && openrouterKey.trim()) {
        payload.openrouter_api_key = openrouterKey.trim();
      }

      // Try to get existing row id
      const { data: existing } = await (supabase.from('settings') as any)
        .select('id')
        .limit(1)
        .maybeSingle();

      let result;
      if (existing?.id) {
        result = await (supabase.from('settings') as any).update(payload).eq('id', existing.id);
      } else {
        result = await (supabase.from('settings') as any).insert(payload);
      }
      if (result.error) throw result.error;

      if (provider === 'openrouter' && openrouterKey.trim()) {
        setOpenrouterKeyMasked(`••••••••${openrouterKey.trim().slice(-4)}`);
        setOpenrouterKey('');
      }
      toast.success('Agent settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save agent settings');
    } finally {
      setSaving(false);
    }
  };

  // ── FAQ functions ──────────────────────────────────────────────────────────
  const loadSharedData = async () => {
    setLoading(true);
    try {
      const faqResult = await (supabase.from('guest_faq_memory') as any)
        .select('*')
        .order('sort_order')
        .order('created_at');
      if (faqResult.error) throw faqResult.error;
      const sharedFaqs = (faqResult.data || []).map(normalizeFaq).filter(Boolean) as FaqItem[];
      setFaqs(sharedFaqs);
      localStorage.setItem(FAQ_KEY, JSON.stringify(sharedFaqs));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load guest answers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSharedData(); }, []);

  const addFaq = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Question and answer are required');
      return;
    }
    try {
      const result = await (supabase.from('guest_faq_memory') as any)
        .insert({
          question: form.question.trim(),
          keywords: form.keywords.trim(),
          answer: form.answer.trim(),
          active: true,
          sort_order: faqs.length,
        })
        .select('*')
        .single();
      if (result.error) throw result.error;
      const item = normalizeFaq(result.data);
      if (item) {
        const next = [...faqs, item];
        setFaqs(next);
        localStorage.setItem(FAQ_KEY, JSON.stringify(next));
      }
      setForm({ question: '', keywords: '', answer: '' });
      toast.success('Guest answer added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add answer');
    }
  };

  const toggleFaq = async (id: string, active: boolean) => {
    const result = await (supabase.from('guest_faq_memory') as any).update({ active }).eq('id', id);
    if (result.error) return toast.error(result.error.message);
    setFaqs(prev => prev.map(item => item.id === id ? { ...item, active } : item));
  };

  const deleteFaq = async (id: string) => {
    const result = await (supabase.from('guest_faq_memory') as any).delete().eq('id', id);
    if (result.error) return toast.error(result.error.message);
    setFaqs(prev => prev.filter(item => item.id !== id));
  };

  const downloadAnswers = () => {
    const templateExample: FaqItem[] = [
      { id: 'template-1', question: 'What time is breakfast?', keywords: 'breakfast, morning meal', answer: 'Breakfast is served daily from 7:00 AM to 10:00 AM at the main dining area.', active: true, sort_order: 0 },
      { id: 'template-2', question: 'What time is check-out?', keywords: 'checkout, check out', answer: 'Check-out time is 11:00 AM. Late check-out may be available on request.', active: true, sort_order: 1 },
    ];
    const isTemplate = faqs.length === 0;
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      template: isTemplate,
      note: 'Shared FAQ memory used by both the guest concierge and staff resort operator agents. Edit rows and re-import to sync to the backend.',
      schema: { question: 'string', keywords: 'string[]', answer: 'string', active: 'boolean', sort_order: 'number' },
      answers: isTemplate ? templateExample : faqs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kapwa-guest-answers${isTemplate ? '-template' : ''}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(isTemplate ? 'Template downloaded — edit and re-import to seed answers' : `${faqs.length} answers downloaded`);
  };

  const importAnswers = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const source = Array.isArray(parsed) ? parsed : parsed?.answers;
      if (!Array.isArray(source)) throw new Error('The file does not contain an answers list.');
      const imported = source.map(normalizeFaq).filter(Boolean) as FaqItem[];
      if (imported.length === 0) throw new Error('No valid answers were found.');
      const existing = new Map(faqs.map(item => [item.question.toLowerCase(), item]));
      const newRows = imported
        .filter(item => !existing.has(item.question.toLowerCase()))
        .map((item, index) => ({
          question: item.question,
          keywords: item.keywords,
          answer: item.answer,
          active: item.active,
          sort_order: faqs.length + index,
        }));
      if (newRows.length === 0) { toast.success('All imported answers already exist'); return; }
      const result = await (supabase.from('guest_faq_memory') as any).insert(newRows).select('*');
      if (result.error) throw result.error;
      await loadSharedData();
      toast.success(`${newRows.length} answers imported`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import answers');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">Agent Settings</h1>
            <p className="font-body text-sm text-muted-foreground">Configure the AI model powering resort operations and guest concierge.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft className="w-4 h-4 mr-2" />Admin</Button>
        </div>

        {/* ── Provider Selection ──────────────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg">AI Provider</h2>
              <p className="text-xs text-muted-foreground">Choose where the agent runs its AI models.</p>
            </div>
            <Switch checked={agentEnabled} onCheckedChange={setAgentEnabled} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'ollama', label: 'Ollama (Local)', desc: 'Runs on your machine' },
              { value: 'openrouter', label: 'OpenRouter (Cloud)', desc: 'Many models, some free' },
              { value: 'hermes', label: 'Hermes Agent', desc: 'Local agent proxy' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setProvider(opt.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  provider === opt.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-display text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ── Ollama Config ───────────────────────────────────────────────── */}
        {provider === 'ollama' && (
          <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Ollama (Local Machine)</h2>
              <div className="flex items-center gap-2">
                {ollamaAvailable === true && <span className="flex items-center gap-1 text-xs text-green-600"><Wifi className="w-3 h-3" />Connected</span>}
                {ollamaAvailable === false && <span className="flex items-center gap-1 text-xs text-red-600"><WifiOff className="w-3 h-3" />Offline</span>}
                <Button variant="outline" size="sm" onClick={() => detectOllama()} disabled={ollamaDetecting}>
                  {ollamaDetecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Detect Models
                </Button>
              </div>
            </div>

            <label className="text-sm space-y-1">
              <span>Ollama URL</span>
              <Input
                value={ollamaUrl}
                onChange={e => {
                  setOllamaUrl(e.target.value);
                  setOllamaAvailable(null);
                }}
                onBlur={() => detectOllama()}
                placeholder="http://127.0.0.1:11434"
              />
            </label>

            <label className="text-sm space-y-1">
              <span>Model</span>
              {ollamaModels.length > 0 ? (
                <Select value={ollamaModel} onValueChange={setOllamaModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ollamaModels.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={ollamaModel}
                  onChange={e => setOllamaModel(e.target.value)}
                  placeholder="e.g. qwen2.5:3b"
                />
              )}
            </label>

            {ollamaModels.length > 0 && (
              <p className="text-xs text-muted-foreground">{ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} detected on your machine.</p>
            )}
          </section>
        )}

        {/* ── OpenRouter Config ───────────────────────────────────────────── */}
        {provider === 'openrouter' && (
          <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">OpenRouter (Cloud)</h2>
              {openrouterLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <label className="text-sm space-y-1">
              <span>API Key</span>
              <Input
                type="password"
                value={openrouterKey}
                onChange={e => setOpenrouterKey(e.target.value)}
                placeholder={openrouterKeyMasked || 'sk-or-...'}
              />
              {openrouterKeyMasked && (
                <p className="text-xs text-muted-foreground">Current: {openrouterKeyMasked}</p>
              )}
            </label>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search models..."
                    value={openrouterSearch}
                    onChange={e => setOpenrouterSearch(e.target.value)}
                  />
                </div>
                <Button
                  variant={showFreeOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFreeOnly(f => !f)}
                >
                  {showFreeOnly ? 'Free Only' : 'Show Free'}
                </Button>
              </div>

              <label className="text-sm space-y-1">
                <span>Model</span>
                {filteredOpenRouterModels.length > 0 ? (
                  <Select value={openrouterModel} onValueChange={setOpenrouterModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {filteredOpenRouterModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name} {model.free ? ' (FREE)' : ''} {model.contextLength ? ` [${Math.round(model.contextLength / 1000)}k]` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={openrouterModel}
                    onChange={e => setOpenrouterModel(e.target.value)}
                    placeholder="e.g. openai/gpt-4o-mini"
                  />
                )}
              </label>

              {openrouterModels.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {filteredOpenRouterModels.length} of {openrouterModels.length} models shown
                  {showFreeOnly && ` (${openrouterModels.filter(m => m.free).length} free total)`}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Hermes Config ───────────────────────────────────────────────── */}
        {provider === 'hermes' && (
          <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
            <h2 className="font-display text-lg">Hermes Agent (Local Proxy)</h2>
            <p className="text-xs text-muted-foreground">Hermes acts as a local agent that routes to a model provider underneath.</p>

            <label className="text-sm space-y-1">
              <span>Hermes uses which provider?</span>
              <Select value={hermesSubProvider} onValueChange={v => setHermesSubProvider(v as 'ollama' | 'openrouter')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (Local Machine)</SelectItem>
                  <SelectItem value="openrouter">OpenRouter (Cloud)</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {hermesSubProvider === 'ollama' && (
              <p className="text-xs text-muted-foreground">Hermes will use the Ollama settings above ({ollamaModel}).</p>
            )}
            {hermesSubProvider === 'openrouter' && (
              <p className="text-xs text-muted-foreground">Hermes will use the OpenRouter settings above ({openrouterModel}).</p>
            )}
          </section>
        )}

        {/* ── Common Settings ─────────────────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <h2 className="font-display text-lg">Model Behavior</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span>Temperature ({temperature})</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Precise</span><span>Creative</span>
              </div>
            </label>
            <label className="text-sm space-y-1">
              <span>Max Reply Tokens</span>
              <Input
                type="number"
                min="80"
                max="2000"
                value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <Button onClick={saveRuntimeSettings} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Agent Settings
        </Button>

        {/* ── Guest FAQ Memory ────────────────────────────────────────────── */}
        <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><h2 className="font-display text-lg">Guest FAQ Memory</h2><p className="text-xs text-muted-foreground">{activeCount} active shared answers.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={loadSharedData} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
              <Button variant="outline" onClick={downloadAnswers}><Download className="w-4 h-4 mr-2" />{faqs.length === 0 ? 'Template' : 'Download'}</Button>
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Import</Button>
              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) importAnswers(file); }} />
            </div>
          </div>

          <div className="space-y-2 border border-border rounded p-3">
            <Input placeholder="Guest question, e.g. What time is breakfast?" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
            <Input placeholder="Keywords, comma separated: breakfast, morning meal" value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} />
            <textarea className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Confirmed answer shown to guests" value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
            <Button onClick={addFaq}><Plus className="w-4 h-4 mr-2" />Add Answer</Button>
          </div>

          <div className="space-y-3">
            {faqs.map(item => (
              <div key={item.id} className="border border-border rounded p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-medium text-sm">{item.question}</p>{item.keywords && <p className="text-xs text-muted-foreground">Keywords: {item.keywords}</p>}</div>
                  <div className="flex items-center gap-2"><Switch checked={item.active} onCheckedChange={active => toggleFaq(item.id, active)} /><Button size="icon" variant="ghost" onClick={() => deleteFaq(item.id)}><Trash2 className="w-4 h-4" /></Button></div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.answer}</p>
              </div>
            ))}
            {!loading && faqs.length === 0 && <p className="text-sm text-muted-foreground">No reusable guest answers yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
