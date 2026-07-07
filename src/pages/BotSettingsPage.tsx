import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Save, Trash2, ArrowLeft, Download, Upload, RefreshCw } from 'lucide-react';

type FaqItem = {
  id: string;
  question: string;
  keywords: string;
  answer: string;
  active: boolean;
  sort_order?: number;
};

type BotSettings = {
  enabled: boolean;
  provider: 'ollama';
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

const SETTINGS_KEY = 'kapwa_bot_settings';
const FAQ_KEY = 'kapwa_bot_faq_memory';

const defaultSettings: BotSettings = {
  enabled: true,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  temperature: 0.2,
  maxTokens: 180,
};

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

export default function BotSettingsPage() {
  const navigate = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BotSettings>(defaultSettings);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [form, setForm] = useState({ question: '', keywords: '', answer: '' });
  const [loading, setLoading] = useState(true);

  const activeCount = useMemo(() => faqs.filter(item => item.active).length, [faqs]);

  const loadSharedData = async () => {
    setLoading(true);
    try {
      const settingsResult = await (supabase.from('settings') as any)
        .select('id, bot_enabled, bot_provider, bot_base_url, bot_model, bot_temperature, bot_max_tokens')
        .limit(1)
        .maybeSingle();

      if (settingsResult.error) throw settingsResult.error;
      if (settingsResult.data) {
        setSettingsId(settingsResult.data.id);
        const sharedSettings: BotSettings = {
          enabled: settingsResult.data.bot_enabled !== false,
          provider: 'ollama',
          baseUrl: settingsResult.data.bot_base_url || defaultSettings.baseUrl,
          model: settingsResult.data.bot_model || defaultSettings.model,
          temperature: Number(settingsResult.data.bot_temperature ?? defaultSettings.temperature),
          maxTokens: Number(settingsResult.data.bot_max_tokens ?? defaultSettings.maxTokens),
        };
        setSettings(sharedSettings);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(sharedSettings));
      }

      const faqResult = await (supabase.from('guest_faq_memory') as any)
        .select('*')
        .order('sort_order')
        .order('created_at');

      if (faqResult.error) throw faqResult.error;
      const sharedFaqs = (faqResult.data || []).map(normalizeFaq).filter(Boolean) as FaqItem[];

      if (sharedFaqs.length === 0) {
        const localFaqs = JSON.parse(localStorage.getItem(FAQ_KEY) || '[]');
        const validLocal = Array.isArray(localFaqs)
          ? localFaqs.map(normalizeFaq).filter(Boolean) as FaqItem[]
          : [];
        if (validLocal.length > 0) {
          const rows = validLocal.map((item, index) => ({
            question: item.question,
            keywords: item.keywords,
            answer: item.answer,
            active: item.active,
            sort_order: index,
          }));
          const migrated = await (supabase.from('guest_faq_memory') as any).insert(rows).select('*');
          if (migrated.error) throw migrated.error;
          const migratedFaqs = (migrated.data || []).map(normalizeFaq).filter(Boolean) as FaqItem[];
          setFaqs(migratedFaqs);
          localStorage.setItem(FAQ_KEY, JSON.stringify(migratedFaqs));
          toast.success('Local guest answers moved to shared memory');
        } else {
          setFaqs([]);
        }
      } else {
        setFaqs(sharedFaqs);
        localStorage.setItem(FAQ_KEY, JSON.stringify(sharedFaqs));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load shared bot data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSharedData();
  }, []);

  const saveSettings = async () => {
    try {
      const payload = {
        bot_enabled: settings.enabled,
        bot_provider: 'ollama',
        bot_base_url: settings.baseUrl.trim(),
        bot_model: settings.model.trim(),
        bot_temperature: settings.temperature,
        bot_max_tokens: settings.maxTokens,
      };
      const result = settingsId
        ? await (supabase.from('settings') as any).update(payload).eq('id', settingsId)
        : await (supabase.from('settings') as any).insert(payload).select('id').single();
      if (result.error) throw result.error;
      if (!settingsId && result.data?.id) setSettingsId(result.data.id);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      toast.success('Shared bot settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save bot settings');
    }
  };

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
      toast.success('Shared guest answer added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add guest answer');
    }
  };

  const toggleFaq = async (id: string, active: boolean) => {
    const result = await (supabase.from('guest_faq_memory') as any).update({ active }).eq('id', id);
    if (result.error) return toast.error(result.error.message);
    const next = faqs.map(item => item.id === id ? { ...item, active } : item);
    setFaqs(next);
    localStorage.setItem(FAQ_KEY, JSON.stringify(next));
  };

  const deleteFaq = async (id: string) => {
    const result = await (supabase.from('guest_faq_memory') as any).delete().eq('id', id);
    if (result.error) return toast.error(result.error.message);
    const next = faqs.filter(item => item.id !== id);
    setFaqs(next);
    localStorage.setItem(FAQ_KEY, JSON.stringify(next));
  };

  const downloadAnswers = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), answers: faqs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kapwa-guest-answers-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`${faqs.length} answers downloaded`);
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

      if (newRows.length === 0) {
        toast.success('All imported answers already exist');
        return;
      }

      const result = await (supabase.from('guest_faq_memory') as any).insert(newRows).select('*');
      if (result.error) throw result.error;
      await loadSharedData();
      toast.success(`${newRows.length} shared answers imported`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import answers');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">Local Agent Settings</h1>
            <p className="font-body text-sm text-muted-foreground">Shared settings and guest answers, with Ollama still running locally.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/admin')}><ArrowLeft className="w-4 h-4 mr-2" />Admin</Button>
        </div>

        <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex items-center justify-between">
            <div><h2 className="font-display text-lg">Local Bot</h2><p className="text-xs text-muted-foreground">Settings are shared through Supabase.</p></div>
            <Switch checked={settings.enabled} onCheckedChange={enabled => setSettings(s => ({ ...s, enabled }))} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm space-y-1"><span>Provider</span><Input value="Ollama" disabled /></label>
            <label className="text-sm space-y-1"><span>Model</span><Input value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value }))} /></label>
            <label className="text-sm space-y-1 md:col-span-2"><span>Ollama URL</span><Input value={settings.baseUrl} onChange={e => setSettings(s => ({ ...s, baseUrl: e.target.value }))} /></label>
            <label className="text-sm space-y-1"><span>Temperature</span><Input type="number" min="0" max="1" step="0.1" value={settings.temperature} onChange={e => setSettings(s => ({ ...s, temperature: Number(e.target.value) }))} /></label>
            <label className="text-sm space-y-1"><span>Maximum reply tokens</span><Input type="number" min="40" max="500" value={settings.maxTokens} onChange={e => setSettings(s => ({ ...s, maxTokens: Number(e.target.value) }))} /></label>
          </div>
          <Button onClick={saveSettings}><Save className="w-4 h-4 mr-2" />Save Bot Settings</Button>
        </section>

        <section className="border border-border rounded-lg p-4 space-y-4 bg-card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><h2 className="font-display text-lg">Guest FAQ Memory</h2><p className="text-xs text-muted-foreground">{activeCount} active shared answers.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={loadSharedData} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
              <Button variant="outline" onClick={downloadAnswers} disabled={faqs.length === 0}><Download className="w-4 h-4 mr-2" />Download Answers</Button>
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Import Answers</Button>
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
