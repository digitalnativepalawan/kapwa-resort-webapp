import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, X, Loader2, Settings } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const API_URL = import.meta.env.VITE_HERMES_URL || '/api/hermes';
const SETTINGS_KEY = 'kapwa_bot_settings';
const FAQ_KEY = 'kapwa_bot_faq_memory';

const defaultSettings = {
  enabled: true,
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  temperature: 0.2,
  maxTokens: 180,
};

function readLocalJson(key: string, fallback: unknown) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function loadSharedBotData() {
  const fallbackSettings = readLocalJson(SETTINGS_KEY, defaultSettings);
  const fallbackMemory = readLocalJson(FAQ_KEY, []);

  try {
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

    if (settingsResult.error) throw settingsResult.error;
    if (memoryResult.error) throw memoryResult.error;

    const row = settingsResult.data;
    const settings = row ? {
      enabled: row.bot_enabled !== false,
      provider: row.bot_provider || 'ollama',
      baseUrl: row.bot_base_url || defaultSettings.baseUrl,
      model: row.bot_model || defaultSettings.model,
      temperature: Number(row.bot_temperature ?? defaultSettings.temperature),
      maxTokens: Number(row.bot_max_tokens ?? defaultSettings.maxTokens),
    } : fallbackSettings;
    const memory = Array.isArray(memoryResult.data) ? memoryResult.data : fallbackMemory;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(FAQ_KEY, JSON.stringify(memory));
    return { settings, memory };
  } catch {
    return { settings: fallbackSettings, memory: fallbackMemory };
  }
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
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setLoading(true);

    try {
      const { settings, memory } = await loadSharedBotData();
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: 'guest-concierge',
          settings,
          memory,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setMessages(m => [...m, {
        role: 'assistant',
        content: data.reply || 'No response from the local agent.',
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: `Local agent unavailable: ${err.message}. Make sure Ollama and the local backend are running.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isAdminPage && (
        <Button
          onClick={() => { window.location.href = '/admin/bot-settings'; }}
          variant="outline"
          className="fixed bottom-6 right-24 z-50 h-14 rounded-full shadow-lg px-4 bg-card"
          aria-label="Open local agent settings"
          title="Local Agent Settings"
        >
          <Settings className="w-5 h-5 mr-2" />
          Local Agent
        </Button>
      )}

      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
          aria-label="Open agent chat"
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md h-[600px] flex flex-col p-0 gap-0 bg-card border-border">
          <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between">
            <DialogTitle className="font-display text-sm tracking-wider text-foreground">
              KAPWA OS Assistant
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground font-body text-sm gap-2">
                <MessageSquare className="w-10 h-10 opacity-40" />
                <p>Ask me anything about your stay.</p>
                <p className="text-xs opacity-60">Common questions can be managed from Local Agent Settings.</p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 font-body text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary border border-border text-foreground'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 opacity-70 ${
                      msg.role === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary border border-border rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-4 py-3 border-t border-border flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder="Type a message..."
              className="font-body bg-secondary border-border text-foreground"
              disabled={loading}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-3"
              aria-label="Send message"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
