import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Cloud, Cpu, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const API_BASE = import.meta.env.VITE_AGENT_RUNTIME_URL || 'http://127.0.0.1:3000/api';
const TOKEN_KEY = 'kapwa_agent_admin_token';

type RuntimeMode = 'openrouter' | 'ollama' | 'hermes';
type RuntimeSettings = {
  enabled: boolean;
  mode: RuntimeMode;
  openrouterModel: string;
  openrouterConfigured: boolean;
  openrouterKeyMasked?: string | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  hermesProvider: 'openrouter' | 'ollama';
  temperature: number;
  maxTokens: number;
};

type OpenRouterModel = { id: string; name: string; free: boolean; contextLength?: number | null };

const defaults: RuntimeSettings = {
  enabled: true,
  mode: 'ollama',
  openrouterModel: 'openai/gpt-4o-mini',
  openrouterConfigured: false,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen2.5:3b',
  hermesProvider: 'ollama',
  temperature: 0.2,
  maxTokens: 500,
};

export default function AgentRuntimeSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RuntimeSettings>(defaults);
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'x-kapwa-admin-token': adminToken,
  }), [adminToken]);

  const loadSettings = async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      sessionStorage.setItem(TOKEN_KEY, adminToken);
      const response = await fetch(`${API_BASE}/runtime/settings`, { headers, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSettings({ ...defaults, ...data });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load AI settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminToken) void loadSettings();
  }, []);

  const loadOpenRouterModels = async () => {
    if (!adminToken) return toast.error('Enter the server admin token first.');
    setLoadingModels(true);
    try {
      const response = await fetch(`${API_BASE}/providers/openrouter/models`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setOpenrouterModels(data.models || []);
      toast.success(`${data.models?.length || 0} OpenRouter models loaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load OpenRouter models');
    } finally {
      setLoadingModels(false);
    }
  };

  const detectOllama = async () => {
    if (!adminToken) return toast.error('Enter the server admin token first.');
    setLoadingModels(true);
    try {
      const response = await fetch(`${API_BASE}/providers/ollama/detect`, {
        method: 'POST', headers, body: JSON.stringify({ baseUrl: settings.ollamaBaseUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const models = data.models || [];
      setOllamaModels(models);
      if (models.length && !models.includes(settings.ollamaModel)) {
        setSettings(current => ({ ...current, ollamaModel: models[0] }));
      }
      toast.success(models.length ? `${models.length} local model${models.length === 1 ? '' : 's'} detected` : 'Ollama is running but has no models installed');
    } catch (error) {
      setOllamaModels([]);
      toast.error(error instanceof Error ? error.message : 'Ollama was not detected');
    } finally {
      setLoadingModels(false);
    }
  };

  const saveSettings = async () => {
    if (!adminToken) return toast.error('Enter the server admin token first.');
    setLoading(true);
    try {
      sessionStorage.setItem(TOKEN_KEY, adminToken);
      const response = await fetch(`${API_BASE}/runtime/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...settings,
          openrouterApiKey: openrouterKey || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setSettings({ ...defaults, ...data });
      setOpenrouterKey('');
      toast.success('AI runtime settings saved securely');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings');
    } finally {
      setLoading(false);
    }
  };

  return <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">KAPWA Hospitality OS</p><h1 className="font-display text-3xl flex items-center gap-2"><Bot className="w-7 h-7" />AI Runtime</h1><p className="text-sm text-muted-foreground mt-1">Choose OpenRouter, local Ollama, or the optional Hermes Agent layer.</p></div>
        <Button variant="outline" onClick={() => navigate('/admin/operator')}><ArrowLeft className="w-4 h-4 mr-2" />Operator</Button>
      </div>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Server authorization</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">This token must match <code>KAPWA_ADMIN_TOKEN</code> on the local agent server. It is kept only in this browser session.</p><div className="flex gap-2"><Input type="password" value={adminToken} onChange={event => setAdminToken(event.target.value)} placeholder="Server admin token" /><Button variant="outline" onClick={loadSettings} disabled={loading || !adminToken}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</Button></div></CardContent></Card>

      <Card><CardHeader><CardTitle>Runtime choice</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><div><p className="font-medium">Agent enabled</p><p className="text-xs text-muted-foreground">Disable all model calls without disabling the backoffice.</p></div><Switch checked={settings.enabled} onCheckedChange={enabled => setSettings(current => ({ ...current, enabled }))} /></div><Select value={settings.mode} onValueChange={(mode: RuntimeMode) => setSettings(current => ({ ...current, mode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openrouter">OpenRouter model</SelectItem><SelectItem value="ollama">Local Ollama model</SelectItem><SelectItem value="hermes">Hermes Agent</SelectItem></SelectContent></Select>{settings.mode === 'hermes' && <div><p className="text-sm mb-2">Hermes model provider</p><Select value={settings.hermesProvider} onValueChange={(hermesProvider: 'openrouter' | 'ollama') => setSettings(current => ({ ...current, hermesProvider }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openrouter">OpenRouter</SelectItem><SelectItem value="ollama">Local Ollama</SelectItem></SelectContent></Select></div>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cloud className="w-5 h-5" />OpenRouter</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Status: {settings.openrouterConfigured ? `Configured ${settings.openrouterKeyMasked || ''}` : 'Not configured'}</p><Input type="password" value={openrouterKey} onChange={event => setOpenrouterKey(event.target.value)} placeholder={settings.openrouterConfigured ? 'Enter a new key only to replace it' : 'sk-or-v1-…'} /><div className="flex gap-2"><Select value={settings.openrouterModel} onValueChange={openrouterModel => setSettings(current => ({ ...current, openrouterModel }))}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent>{openrouterModels.length ? openrouterModels.map(model => <SelectItem key={model.id} value={model.id}>{model.free ? 'FREE · ' : 'PAID · '}{model.name}</SelectItem>) : <SelectItem value={settings.openrouterModel}>{settings.openrouterModel}</SelectItem>}</SelectContent></Select><Button variant="outline" onClick={loadOpenRouterModels} disabled={loadingModels || !adminToken}>{loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load models'}</Button></div></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cpu className="w-5 h-5" />Local Ollama</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={settings.ollamaBaseUrl} onChange={event => setSettings(current => ({ ...current, ollamaBaseUrl: event.target.value }))} placeholder="http://127.0.0.1:11434" /><div className="flex gap-2">{ollamaModels.length ? <Select value={settings.ollamaModel} onValueChange={ollamaModel => setSettings(current => ({ ...current, ollamaModel }))}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent>{ollamaModels.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent></Select> : <Input value={settings.ollamaModel} onChange={event => setSettings(current => ({ ...current, ollamaModel: event.target.value }))} placeholder="qwen2.5:3b" />}<Button variant="outline" onClick={detectOllama} disabled={loadingModels || !adminToken}>{loadingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Detect'}</Button></div></CardContent></Card>

      <Card><CardHeader><CardTitle>Generation controls</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3"><label className="text-sm space-y-1"><span>Temperature</span><Input type="number" min="0" max="1" step="0.1" value={settings.temperature} onChange={event => setSettings(current => ({ ...current, temperature: Number(event.target.value) }))} /></label><label className="text-sm space-y-1"><span>Maximum tokens</span><Input type="number" min="80" max="2000" value={settings.maxTokens} onChange={event => setSettings(current => ({ ...current, maxTokens: Number(event.target.value) }))} /></label></CardContent></Card>

      <Button onClick={saveSettings} disabled={loading || !adminToken} className="w-full md:w-auto"><Save className="w-4 h-4 mr-2" />Save AI runtime</Button>
    </div>
  </div>;
}
