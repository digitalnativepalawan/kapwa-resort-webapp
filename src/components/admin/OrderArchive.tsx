import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Search } from 'lucide-react';
import { format } from 'date-fns';

const PAGE_SIZE = 50;

const OrderArchive = () => {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(0);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['order-archive'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(1000);
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    let result = orders;
    if (dateFrom) result = result.filter(o => o.created_at >= dateFrom);
    if (dateTo) result = result.filter(o => o.created_at <= dateTo + 'T23:59:59');
    if (typeFilter !== 'all') result = result.filter(o => o.order_type === typeFilter);
    if (paymentFilter !== 'all') result = result.filter(o => o.payment_type === paymentFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.guest_name?.toLowerCase().includes(q) ||
        o.staff_name?.toLowerCase().includes(q) ||
        o.location_detail?.toLowerCase().includes(q) ||
        ((o.items as any[]) || []).some((i: any) => i.name?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [orders, dateFrom, dateTo, typeFilter, paymentFilter, search]);

  const paged = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const orderTypes = [...new Set(orders.map(o => o.order_type))].filter(Boolean);
  const paymentTypes = [...new Set(orders.map(o => o.payment_type))].filter(Boolean);

  const exportCsv = () => {
    const headers = ['Date', 'Order Type', 'Guest', 'Staff', 'Location', 'Items', 'Total', 'Payment', 'Status'];
    const rows = filtered.map(o => [
      format(new Date(o.created_at), 'yyyy-MM-dd HH:mm'),
      o.order_type,
      o.guest_name,
      o.staff_name,
      o.location_detail || '',
      ((o.items as any[]) || []).map((i: any) => `${i.qty || 1}x ${i.name}`).join('; '),
      o.total,
      o.payment_type || '',
      o.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-archive-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'New': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Preparing': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'Served': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Paid': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-secondary text-foreground';
    }
  };

  const inputCls = "bg-secondary border-border text-foreground font-body text-sm";

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm tracking-wider text-foreground">Order Archive</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} className="font-body text-xs">
            <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input placeholder="Search guest, staff, items..." value={search} onChange={e => setSearch(e.target.value)} className={`${inputCls} flex-1`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" className={inputCls} />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Order Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {orderTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              {paymentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <p className="font-body text-xs text-muted-foreground">{filtered.length} orders found</p>

        {/* Orders list */}
        <div className="space-y-2">
          {paged.map(o => {
            const items = (o.items as any[]) || [];
            return (
              <div key={o.id} className="p-3 rounded border border-border bg-secondary/50 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-xs text-muted-foreground">
                    {format(new Date(o.created_at), 'MMM d, yyyy h:mma')}
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(o.status)}`}>{o.status}</Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] bg-secondary">{o.order_type}</Badge>
                  {o.location_detail && <span className="font-body text-xs text-foreground">{o.location_detail}</span>}
                  {o.guest_name && <span className="font-body text-xs text-muted-foreground">· {o.guest_name}</span>}
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  {items.map((i: any) => `${i.qty || 1}x ${i.name}`).join(', ')}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-foreground">₱{Number(o.total).toLocaleString()}</span>
                  <span className="font-body text-xs text-muted-foreground">
                    {o.payment_type && `${o.payment_type} · `}Staff: {o.staff_name || '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {paged.length < filtered.length && (
          <Button variant="outline" className="w-full font-body text-xs" onClick={() => setPage(p => p + 1)}>
            Load more ({filtered.length - paged.length} remaining)
          </Button>
        )}

        {isLoading && <p className="font-body text-xs text-muted-foreground text-center py-4">Loading...</p>}
      </CardContent>
    </Card>
  );
};

export default OrderArchive;
