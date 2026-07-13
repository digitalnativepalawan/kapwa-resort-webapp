// OperatorChat — talk to the ONE resort-operator agent from /admin/operator.
// Calls the resort-operator edge function { action: "ask" }: the agent loads
// live resort state and answers from it. No local runtime, no Hermes.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Loader2, Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  model?: string;
  tokens?: number;
  at: Date;
}

const SUGGESTIONS = [
  'Who owes money and how much?',
  'Which rooms are not ready for today\u2019s arrivals?',
  'Anything overdue or escalated right now?',
  'What needs my approval?',
];

export default function OperatorChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const ask = async (raw?: string) => {
    const question = (raw ?? input).trim();
    if (!question || loading) return;
    setInput('');
    setMessages(current => [...current, { role: 'user', content: question, at: new Date() }]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('resort-operator', {
        body: { action: 'ask', question },
      });
      if (error) throw new Error(error.message || 'Agent unreachable');
      if (!data?.ok) throw new Error(data?.detail || data?.error || 'Agent returned no answer');
      setMessages(current => [...current, {
        role: 'agent',
        content: data.answer,
        model: data.model,
        tokens: data.tokens,
        at: new Date(),
      }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMessages(current => [...current, {
        role: 'agent',
        content: `Agent unavailable: ${message}`,
        at: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />Ask the resort operator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <Button key={s} size="sm" variant="outline" onClick={() => ask(s)} disabled={loading}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {messages.length > 0 && (
          <div ref={scrollRef} className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-card'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'agent' && m.model && (
                    <div className="mt-2 flex gap-2">
                      <Badge variant="secondary" className="text-[10px]">{m.model}</Badge>
                      {typeof m.tokens === 'number' && <Badge variant="outline" className="text-[10px]">{m.tokens} tok</Badge>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg border bg-card px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') ask(); }}
            placeholder="Ask about live operations: balances, rooms, requests, tours..."
            disabled={loading}
            maxLength={1000}
          />
          <Button onClick={() => ask()} disabled={loading || !input.trim()} className="px-3" aria-label="Ask the operator">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Answers come from the live database state. The agent never executes payments, refunds, or booking changes — those always queue for your approval.</p>
      </CardContent>
    </Card>
  );
}
