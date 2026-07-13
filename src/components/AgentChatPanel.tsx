import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, MessageSquare, Send, X, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}



type BotProvider = 'openrouter' | 'ollama';

const defaultSettings = {
  enabled: true,
  provider: 'openrouter' as BotProvider,
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen2.5:3b',
  temperature: 0.2,
  maxTokens: 500,
};

async function loadSharedBotData() {
  const [settingsResult, memoryResult] = await Promise.all([
    (supabase.from('settings') as any)
      .select('bot_enabled, bot_provider, bot_base_url, bot_model, bot_temperature, bot_max_tokens')
      .limit(1)
      .maybeSingle(),
    (supabase.from('guest_faq_memory') as any)
      .select('id, question, keywords, answer, active, sort_order')
      .eq('active', true)
      .order('sort_order'),
  ]);

  const row = settingsResult.data;
  const provider: BotProvider = row?.bot_provider === 'ollama' ? 'ollama' : 'openrouter';
  return {
    settings: {
      ...defaultSettings,
      enabled: row?.bot_enabled !== false,
      provider,
      ollamaUrl: row?.bot_base_url || defaultSettings.ollamaUrl,
      ollamaModel: row?.bot_model || defaultSettings.ollamaModel,
      temperature: Number(row?.bot_temperature ?? defaultSettings.temperature),
      maxTokens: Number(row?.bot_max_tokens ?? defaultSettings.maxTokens),
    },
    memory: memoryResult.data || [],
  };
}

const GUEST_SYSTEM_PROMPT = `You are the guest concierge for BAIA Beachfront Boutique Lodge in San Vicente, Palawan. Never invent facts. If a fact is not in the Approved Q&A or confirmed info below, say: "I don't have that confirmed. Please ask the BAIA staff and I can help pass the request along." Keep replies warm, direct, and 1–3 short sentences. Taglish "po" is welcome.`;

function buildSystemPrompt(memory: any[]): string {
  if (!Array.isArray(memory) || !memory.length) return GUEST_SYSTEM_PROMPT;
  const approved = memory
    .filter(e => e && e.active !== false && e.question && e.answer)
    .map(e => {
      const kw = e.keywords?.trim() ? ` (keywords: ${e.keywords.trim()})` : '';
      return `Q: ${String(e.question).trim()}${kw}\nA: ${String(e.answer).trim()}`;
    })
    .join('\n\n');
  return approved
    ? `${GUEST_SYSTEM_PROMPT}\n\n## Approved Q&A (staff-verified)\nIf the guest's question matches one of these by meaning or keywords, answer using the corresponding approved answer verbatim.\n\n${approved}`
    : GUEST_SYSTEM_PROMPT;
}

async function callOllama(settings: typeof defaultSettings, systemPrompt: string, history: { role: string; content: string }[], userMessage: string): Promise<string> {
  const baseUrl = settings.ollamaUrl.replace(/\/$/, '');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: userMessage },
  ];
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel,
      messages,
      stream: false,
      options: { temperature: settings.temperature, num_predict: settings.maxTokens },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const reply = data?.message?.content?.trim();
  if (!reply) throw new Error('Ollama returned an empty response');
  return reply;
}

export default function AgentChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdminPage = window.location.pathname.startsWith('/admin');

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(current => [...current, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setLoading(true);

    try {
      const { memory } = await loadSharedBotData();
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('hermes-chat', {
        body: { message: userMessage, memory, history },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMessages(current => [...current, {
        role: 'assistant',
        content: data?.reply || 'No response from the guest concierge.',
        timestamp: new Date(),
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages(current => [...current, {
        role: 'assistant',
        content: `Guest concierge unavailable: ${message}.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isAdminPage && (
        <Button onClick={() => { window.location.href = '/admin/operator'; }} variant="outline" className="fixed bottom-6 right-24 z-50 h-14 rounded-full shadow-lg px-4 bg-card">
          <Bot className="w-5 h-5 mr-2" />Resort Operator
        </Button>
      )}

      {!open && (
        <Button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90" aria-label="Open guest concierge">
          <MessageSquare className="w-6 h-6" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md h-[600px] max-h-[85vh] flex flex-col p-0 gap-0 bg-card border-border">
          <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between">
            <DialogTitle className="font-display text-sm tracking-wider text-foreground">KAPWA Guest Concierge</DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close guest concierge"><X className="w-4 h-4" /></Button>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground font-body text-sm gap-2">
                <MessageSquare className="w-10 h-10 opacity-40" />
                <p>How may we help with your stay?</p>
                <p className="text-xs opacity-60">Uses the model selected in Admin settings.</p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 font-body text-sm ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary border border-border text-foreground'}`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {loading && <div className="flex justify-start"><div className="bg-secondary border border-border rounded-lg px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div></div>}
            </div>
          </ScrollArea>

          <div className="px-4 py-3 border-t border-border flex gap-2">
            <Input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendMessage(); }} placeholder="Ask about your stay..." disabled={loading} maxLength={1000} />
            <Button onClick={sendMessage} disabled={loading || !input.trim()} className="px-3" aria-label="Send message">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
