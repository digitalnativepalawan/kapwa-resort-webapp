import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { RefreshCw, Send, CheckCircle, XCircle, AlertTriangle, Zap, Trash2 } from 'lucide-react';

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-webhook`;
const PROCESS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-webhook-queue`;

const IntegrationReadinessDashboard = () => {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const isDev = import.meta.env.DEV;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['webhook-events'],
    enabled: isDev,
    queryFn: async () => {
      const { data } = await supabase
        .from('webhook_events' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
    refetchInterval: 5000,
  });

  const { data: schemaStatus } = useQuery({
    queryKey: ['integration-schema-status'],
    enabled: isDev,
    queryFn: async () => {
      // Check if new columns exist by querying a booking
      try {
        const { data, error } = await supabase
          .from('resort_ops_bookings')
          .select('source, external_reservation_id, last_synced_at, external_data')
          .limit(1);
        const bookingColumnsOk = !error;

        const { error: weErr } = await supabase
          .from('webhook_events' as any)
          .select('id')
          .limit(1);
        const webhookTableOk = !weErr;

        return { bookingColumnsOk, webhookTableOk };
      } catch {
        return { bookingColumnsOk: false, webhookTableOk: false };
      }
    },
  });

  const sendSimulation = async (eventType: string, payload: any) => {
    setSending(true);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, source: 'simulation', ...payload }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`Simulation "${eventType}" queued`);
        qc.invalidateQueries({ queryKey: ['webhook-events'] });
      } else {
        toast.error(`Simulation failed: ${data.error || res.statusText}`);
      }
    } catch (err: any) {
      toast.error(`Failed to send: ${err.message}`);
    }
    setSending(false);
  };

  const processQueue = async () => {
    setSending(true);
    try {
      const res = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Processed ${data.processed} event(s)`);
        qc.invalidateQueries({ queryKey: ['webhook-events'] });
      } else {
        toast.error(`Process failed: ${data.error}`);
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
    setSending(false);
  };

  const clearTestEvents = async () => {
    setSending(true);
    try {
      await supabase
        .from('webhook_events' as any)
        .delete()
        .eq('source', 'simulation');
      toast.success('Test events cleared');
      qc.invalidateQueries({ queryKey: ['webhook-events'] });
    } catch {
      toast.error('Failed to clear');
    }
    setSending(false);
  };

  const simNewReservation = () =>
    sendSimulation('new_reservation', {
      guest_name: 'Test Integration Guest',
      email: 'test@integration.dev',
      phone: '+639001234567',
      check_in: '2026-06-01',
      check_out: '2026-06-05',
      adults: 2,
      room_rate: 3500,
      external_reservation_id: `SIM-${Date.now()}`,
    });

  const simDateChange = () =>
    sendSimulation('date_change', {
      external_reservation_id: events.find((e: any) => e.event_type === 'new_reservation' && e.status === 'processed')
        ? JSON.parse(JSON.stringify(
            events.find((e: any) => e.event_type === 'new_reservation' && e.status === 'processed')?.payload
          ))?.external_reservation_id
        : `SIM-MISSING`,
      check_in: '2026-06-03',
      check_out: '2026-06-08',
    });

  const simCancellation = () =>
    sendSimulation('cancellation', {
      external_reservation_id: events.find((e: any) => e.event_type === 'new_reservation' && e.status === 'processed')
        ? JSON.parse(JSON.stringify(
            events.find((e: any) => e.event_type === 'new_reservation' && e.status === 'processed')?.payload
          ))?.external_reservation_id
        : `SIM-MISSING`,
    });

  const statusIcon = (s: string) => {
    if (s === 'processed') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    if (s === 'error') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    if (s === 'retry') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
    return <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />;
  };

  if (!isDev) return null;

  return (
    <div className="space-y-4">
      {/* TEST MODE BANNER */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <div>
          <p className="font-display text-sm font-semibold text-yellow-500">TEST MODE — Integration Readiness</p>
          <p className="font-body text-xs text-muted-foreground">
            This dashboard is only visible in development. No production data is affected by simulations.
          </p>
        </div>
      </div>

      {/* Schema Status */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm">Schema Status</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Badge variant="outline" className={schemaStatus?.bookingColumnsOk ? 'text-green-400 border-green-400/30' : 'text-destructive border-destructive/30'}>
            {schemaStatus?.bookingColumnsOk ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
            Booking Columns
          </Badge>
          <Badge variant="outline" className={schemaStatus?.webhookTableOk ? 'text-green-400 border-green-400/30' : 'text-destructive border-destructive/30'}>
            {schemaStatus?.webhookTableOk ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
            Webhook Events Table
          </Badge>
        </CardContent>
      </Card>

      {/* Simulation Tools */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" /> Simulation Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={simNewReservation} disabled={sending} className="text-xs">
              <Send className="w-3.5 h-3.5 mr-1.5" /> New Reservation
            </Button>
            <Button size="sm" variant="outline" onClick={simDateChange} disabled={sending} className="text-xs">
              <Send className="w-3.5 h-3.5 mr-1.5" /> Date Change
            </Button>
            <Button size="sm" variant="outline" onClick={simCancellation} disabled={sending} className="text-xs">
              <Send className="w-3.5 h-3.5 mr-1.5" /> Cancellation
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={processQueue} disabled={sending} className="text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sending ? 'animate-spin' : ''}`} /> Process Queue
            </Button>
            <Button size="sm" variant="ghost" onClick={clearTestEvents} disabled={sending} className="text-xs text-muted-foreground">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear Test Events
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Events Log */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm">Webhook Events Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet. Use simulation tools above to create test events.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Event ID</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Retries</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs font-mono truncate max-w-[120px]">{e.event_id}</TableCell>
                      <TableCell className="text-xs">{e.event_type}</TableCell>
                      <TableCell className="text-xs">{e.source}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          {statusIcon(e.status)} {e.status}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{e.retry_count}</TableCell>
                      <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-destructive truncate max-w-[150px]">{e.error_message || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationReadinessDashboard;
