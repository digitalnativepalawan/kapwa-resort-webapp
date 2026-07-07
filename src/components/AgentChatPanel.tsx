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
    setMessages(current => [
      ...current,
      { role: 'user', content: userMessage, timestamp: new Date() },
    ]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('guest-chat', {
        body: { message: userMessage },
      });

      if (error) throw error;

      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: data?.reply || 'The guest concierge could not provide a response.',
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: `The guest concierge is temporarily unavailable. Please contact reception for assistance. (${message})`,
          timestamp: new Date(),
        },
      ]);
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
          aria-label="Open guest concierge settings"
          title="Guest Concierge Settings"
        >
          <Settings className="w-5 h-5 mr-2" />
          Guest Concierge
        </Button>
      )}

      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90"
          aria-label="Open guest concierge"
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md h-[600px] max-h-[85vh] flex flex-col p-0 gap-0 bg-card border-border">
          <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between">
            <DialogTitle className="font-display text-sm tracking-wider text-foreground">
              KAPWA Guest Concierge
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label="Close guest concierge"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground font-body text-sm gap-2">
                <MessageSquare className="w-10 h-10 opacity-40" />
                <p>How may we help with your stay?</p>
                <p className="text-xs opacity-60">Confirmed guest information is managed by KAPWA staff.</p>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 font-body text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary border border-border text-foreground'
                  }`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className={`text-[10px] mt-1 opacity-70 ${
                      message.role === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') sendMessage(); }}
              placeholder="Ask about your stay..."
              className="font-body bg-secondary border-border text-foreground"
              disabled={loading}
              maxLength={1000}
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
