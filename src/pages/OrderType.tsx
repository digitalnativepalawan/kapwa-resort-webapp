import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import StaffOrdersView from '@/components/staff/StaffOrdersView';

const OrderType = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'guest';
  const returnTo = searchParams.get('returnTo') || '';
  const isStaff = mode === 'staff';

  const [selectedType, setSelectedType] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [guestName, setGuestName] = useState('');

  const { data: orderTypes = [] } = useQuery({
    queryKey: ['order-types'],
    queryFn: async () => {
      const { data } = await supabase.from('order_types').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return data || [];
    },
  });

  const { data: tables } = useQuery({
    queryKey: ['resort_tables'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_tables').select('*').eq('active', true).order('table_name');
      return data || [];
    },
  });

  // Query occupied rooms with guest names — single joined query, no dependency on units query
  const { data: occupiedGuests = [] } = useQuery({
    queryKey: ['occupied-guests'],
    enabled: isStaff,
    staleTime: 30000,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Single query: active bookings with guest names and unit names
      const { data: bookings } = await supabase
        .from('resort_ops_bookings')
        .select('id, check_in, check_out, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
        .lte('check_in', today)
        .gte('check_out', today)
        .is('checked_out_at', null);

      if (!bookings || bookings.length === 0) return [];

      // Fetch units list (self-contained, no external dependency)
      const { data: unitsList } = await supabase
        .from('units')
        .select('id, unit_name')
        .eq('active', true);

      const unitsMap = new Map(
        (unitsList || []).map(u => [u.unit_name.toLowerCase().trim(), u])
      );

      return bookings
        .map(b => {
          const opsUnitName = (b.resort_ops_units as any)?.name || '';
          const unit = unitsMap.get(opsUnitName.toLowerCase().trim());
          if (!unit) return null;
          return {
            unitId: unit.id,
            unitName: unit.unit_name,
            guestName: (b.resort_ops_guests as any)?.full_name || '',
            isDeparting: b.check_out === today,
          };
        })
        .filter(Boolean) as { unitId: string; unitName: string; guestName: string; isDeparting: boolean }[];
    },
    refetchInterval: 30000,
  });

  const activeOrderType = orderTypes.find(ot => ot.type_key === selectedType);
  const canProceed = selectedType && locationDetail;

  const getSelectOptions = (sourceTable: string | null) => {
    if (sourceTable === 'units') return units?.map(u => ({ id: u.id, name: u.unit_name })) || [];
    if (sourceTable === 'resort_tables') return tables?.map(t => ({ id: t.id, name: t.table_name })) || [];
    return [];
  };

  const handleGuestCardTap = (guest: { unitName: string; guestName: string }) => {
    const params = new URLSearchParams({
      mode,
      orderType: 'Room',
      location: guest.unitName,
      roomName: guest.unitName,
    });
    if (guest.guestName) params.set('guestName', guest.guestName);
    if (returnTo) params.set('returnTo', returnTo);
    navigate(`/menu?${params.toString()}`);
  };

  const handleProceed = () => {
    if (!canProceed) return;
    const params = new URLSearchParams({ mode, orderType: selectedType, location: locationDetail });
    if (guestName.trim()) params.set('guestName', guestName.trim());
    const sourceTable = activeOrderType?.source_table;
    if (sourceTable === 'units') {
      params.set('roomName', locationDetail);
    }
    if (returnTo) params.set('returnTo', returnTo);
    navigate(`/menu?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-navy-texture flex flex-col">
      <div className="flex flex-col items-center justify-center px-6 py-12 relative">
        <button onClick={() => navigate(returnTo || '/')} className="absolute top-6 left-6 text-cream-dim hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>

        <h2 className="font-display text-2xl tracking-wider text-foreground mb-2">Order Type</h2>
        <p className="font-body text-sm text-cream-dim mb-6">Where would you like your order?</p>

        {/* Current Guests quick-select (staff only) */}
        {isStaff && occupiedGuests.length > 0 && (
          <div className="w-full max-w-xs mb-8">
            <p className="font-display text-xs tracking-widest text-gold uppercase mb-3 text-center">Current Guests</p>
            <div className="grid grid-cols-1 gap-2">
              {occupiedGuests.map(guest => (
                <button
                  key={guest.unitId}
                  onClick={() => handleGuestCardTap(guest)}
                  className="flex items-center gap-3 px-4 py-3 border border-border rounded-md bg-secondary/50 hover:border-gold/60 transition-colors text-left"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${guest.isDeparting ? 'bg-orange-400' : 'bg-blue-400'} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${guest.isDeparting ? 'bg-orange-500' : 'bg-blue-500'}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm text-foreground tracking-wide truncate">{guest.unitName}</span>
                      {guest.isDeparting && (
                        <span className="text-[10px] font-body text-orange-400 whitespace-nowrap">Checking out</span>
                      )}
                    </div>
                    {guest.guestName && (
                      <span className="font-body text-xs text-cream-dim block truncate">{guest.guestName}</span>
                    )}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cream-dim shrink-0"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-xs flex flex-col gap-6">
          {/* Order type buttons */}
          <div className="grid grid-cols-2 gap-3">
            {orderTypes.map(ot => (
              <button
                key={ot.id}
                onClick={() => { setSelectedType(ot.type_key); setLocationDetail(''); setGuestName(''); }}
                className={`min-h-[48px] py-3 border font-display text-sm tracking-wider transition-colors ${
                  selectedType === ot.type_key
                    ? 'border-gold text-foreground bg-foreground/5'
                    : 'border-border text-cream-dim hover:border-foreground/30'
                }`}
              >
                {ot.label}
              </button>
            ))}
          </div>

          {/* Standard select with tiles for tables, dropdown for units */}
          {activeOrderType && activeOrderType.input_mode === 'select' && activeOrderType.source_table && (
            <div className="space-y-3">
              {activeOrderType.source_table === 'resort_tables' ? (
                <div className="grid grid-cols-3 gap-2">
                  {getSelectOptions(activeOrderType.source_table).map(item => (
                    <button
                      key={item.id}
                      onClick={() => setLocationDetail(item.name)}
                      className={`min-h-[48px] py-3 border font-display text-sm tracking-wider transition-colors rounded ${
                        locationDetail === item.name
                          ? 'border-gold text-foreground bg-foreground/5'
                          : 'border-border text-cream-dim hover:border-foreground/30'
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : (
                <Select onValueChange={setLocationDetail} value={locationDetail}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                    <SelectValue placeholder={activeOrderType.placeholder || 'Select'} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {getSelectOptions(activeOrderType.source_table).map(item => (
                      <SelectItem key={item.id} value={item.name} className="text-foreground font-body">
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
            </div>
          )}

          {activeOrderType && activeOrderType.input_mode === 'text' && (
            <div className="space-y-3">
              <Input
                placeholder={activeOrderType.placeholder || 'Name or details'}
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
              <Input
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="bg-secondary border-border text-foreground font-body"
              />
            </div>
          )}

          <Button
            onClick={handleProceed}
            disabled={!canProceed}
            className="font-display tracking-wider py-6 mt-2"
          >
            View Menu
          </Button>
        </div>
      </div>

      {/* Real-time orders pipeline for staff */}
      {isStaff && (
        <div className="flex-1 border-t border-border">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <h3 className="font-display text-lg tracking-wider text-foreground text-center mb-1">Today's Orders</h3>
          </div>
          <StaffOrdersView />
        </div>
      )}
    </div>
  );
};

export default OrderType;
