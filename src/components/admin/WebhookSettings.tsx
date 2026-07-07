import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Wifi, WifiOff, Copy, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sirvoy-webhook`;

const WebhookSettings = () => {
  const [testing, setTesting] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [lastTestTime, setLastTestTime] = useState<string | null>(null);

  const copyUrl = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success('Webhook URL copied to clipboard');
  };

  const testHealth = async () => {
    setTesting(true);
    try {
      const res = await fetch(WEBHOOK_URL, { method: 'GET' });
      if (res.ok) {
        setHealthStatus('ok');
        toast.success('Webhook is healthy and responding');
      } else {
        setHealthStatus('error');
        toast.error(`Webhook returned status ${res.status}`);
      }
    } catch {
      setHealthStatus('error');
      toast.error('Failed to reach webhook endpoint');
    }
    setLastTestTime(new Date().toLocaleTimeString());
    setTesting(false);
  };

  const testNewBooking = async () => {
    setTesting(true);
    try {
      const testPayload = {
        version: "2.0",
        generatedAt: new Date().toISOString(),
        event: "new",
        propertyId: 1,
        bookingId: 99999,
        bookingDate: new Date().toISOString(),
        arrivalDate: "2026-12-25",
        departureDate: "2026-12-28",
        cancelled: false,
        totalAdults: 2,
        guest: {
          firstName: "Test",
          lastName: "Webhook",
          phone: "+639001234567",
          email: "test@webhook.com",
          message: "This is a test booking from webhook settings"
        },
        guestReference: "TEST-001",
        bookingSource: "Front desk",
        rooms: [{
          RoomTypeName: "Test Room",
          RoomName: "G1",
          RoomId: 1,
          arrivalDate: "2026-12-25",
          departureDate: "2026-12-28",
          adults: 2,
          quantity: 3,
          price: 1500,
          roomTotal: 4500,
        }],
        additionalItems: [],
        currency: "PHP",
        totalPrice: 4500,
        totalSurcharges: 0,
        totalPriceIncludingSurcharges: 4500,
        payments: [],
        invoices: []
      };

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success('Test booking created! Check your Reservations ledger for "Test Webhook" on Dec 25, 2026.');
      } else {
        toast.error(`Test failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('Failed to send test booking');
    }
    setTesting(false);
  };

  const cleanupTest = async () => {
    setTesting(true);
    try {
      // Send a cancel event for the test booking
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: "2.0",
          generatedAt: new Date().toISOString(),
          event: "canceled",
          bookingId: 99999,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success('Test booking cleaned up');
      } else {
        toast.error('Cleanup failed');
      }
    } catch {
      toast.error('Failed to clean up');
    }
    setTesting(false);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base flex items-center gap-2">
          <Wifi className="w-4 h-4" />
          Sirvoy Webhook Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="space-y-1.5">
          <p className="font-body text-xs text-muted-foreground">Webhook URL (paste this in Sirvoy → Settings → Booking event webhook)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-secondary text-foreground p-2 rounded border border-border break-all font-mono">
              {WEBHOOK_URL}
            </code>
            <Button size="icon" variant="outline" className="h-8 w-8 flex-shrink-0" onClick={copyUrl}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Health Check */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={testHealth} disabled={testing} className="text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${testing ? 'animate-spin' : ''}`} />
            Test Health
          </Button>
          {healthStatus === 'ok' && (
            <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs">
              <CheckCircle className="w-3 h-3 mr-1" /> Connected
            </Badge>
          )}
          {healthStatus === 'error' && (
            <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
              <XCircle className="w-3 h-3 mr-1" /> Error
            </Badge>
          )}
          {lastTestTime && (
            <span className="text-xs text-muted-foreground">Last tested: {lastTestTime}</span>
          )}
        </div>

        {/* Test Booking */}
        <div className="border-t border-border pt-3 space-y-2">
          <p className="font-body text-xs text-muted-foreground">Send a test booking to verify the full sync pipeline</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={testNewBooking} disabled={testing} className="text-xs">
              Send Test Booking
            </Button>
            <Button size="sm" variant="ghost" onClick={cleanupTest} disabled={testing} className="text-xs text-muted-foreground">
              Clean Up Test Data
            </Button>
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="border-t border-border pt-3">
          <p className="font-body text-xs font-medium text-foreground mb-1.5">Setup Instructions</p>
          <ol className="font-body text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Copy the webhook URL above</li>
            <li>Go to <strong>Sirvoy → Settings → Sirvoy account → Booking event webhook</strong></li>
            <li>Add a new webhook and paste the URL</li>
            <li>Click "Test Health" above to verify connectivity</li>
            <li>Optionally send a test booking to confirm full sync</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

export default WebhookSettings;
