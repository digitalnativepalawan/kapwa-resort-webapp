import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function SwarmControl() {
  const [status, setStatus] = useState<'idle' | 'running'>('idle');
  const [thinking, setThinking] = useState(false);

  const testOllama = async () => {
    setThinking(true);
    try {
      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "llama3.2:3b",
          messages: [{ role: "user", content: "Hello from KAPWA OS Agent Swarm!" }],
          stream: false
        })
      });

      if (!res.ok) throw new Error("Ollama not responding");

      const data = await res.json();
      toast.success(`✅ Ollama works! Reply: ${data.message?.content?.slice(0, 100)}...`);
    } catch (err) {
      toast.error("Cannot reach Ollama. Make sure `ollama serve` is running.");
    } finally {
      setThinking(false);
    }
  };

  const startSwarm = () => {
    setStatus('running');
    toast.info("Swarm activated (placeholder for now)");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="font-display text-3xl tracking-wider">Agent Swarm Control</h1>
        <Badge variant={status === 'running' ? 'default' : 'secondary'}>
          {status === 'running' ? '🟢 Running' : '⚪ Idle'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Local AI (Ollama)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={testOllama} 
            disabled={thinking}
            className="w-full font-display tracking-wider"
          >
            {thinking ? "Testing Ollama..." : "Test Ollama Connection"}
          </Button>

          <Button onClick={startSwarm} size="lg" className="w-full font-display tracking-wider">
            Start Agent Swarm
          </Button>

          <p className="text-sm text-muted-foreground">
            Next: We'll make real agents that can read/write your orders, bookings, inventory, etc.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
