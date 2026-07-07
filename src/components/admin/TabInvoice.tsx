import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResortProfile } from '@/hooks/useResortProfile';
import { useInvoiceSettings } from '@/hooks/useInvoiceSettings';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, X, Plus, Minus, ShoppingCart, Download, MessageCircle, Trash2, BedDouble } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { generateInvoicePdf, buildInvoiceWhatsAppText } from '@/lib/generateInvoicePdf';
import { useBillingConfig } from '@/hooks/useBillingConfig';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { getStaffSession } from '@/lib/session';

interface TabInvoiceProps {
  tabId: string;
  onClose: () => void;
  isAdmin?: boolean;
}

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

interface CartEntry {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const TYPE_LABELS: Record<string, string> = {
  Room: 'Room Delivery',
  DineIn: 'Dine In',
  Beach: 'Beach Delivery',
  WalkIn: 'Walk-In Guest',
};

const EditableOrderItems = ({ items, onSave }: { items: OrderItem[]; onSave: (items: OrderItem[]) => void }) => {
  const [editItems, setEditItems] = useState<OrderItem[]>(() => items.map(i => ({ ...i })));

  const updateQty = (idx: number, delta: number) => {
    setEditItems(prev => {
      const next = [...prev];
      const newQty = next[idx].qty + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: newQty };
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1">
      {editItems.map((item, i) => (
        <div key={i} className="flex items-center justify-between py-0.5">
          <span className="font-body text-sm text-foreground flex-1">{item.name}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => updateQty(i, -1)} className="w-7 h-7 flex items-center justify-center rounded bg-secondary text-foreground hover:bg-destructive/20">
              <Minus className="w-3 h-3" />
            </button>
            <span className="font-display text-sm text-foreground w-5 text-center">{item.qty}</span>
            <button onClick={() => updateQty(i, 1)} className="w-7 h-7 flex items-center justify-center rounded bg-secondary text-foreground hover:bg-primary/20">
              <Plus className="w-3 h-3" />
            </button>
            <span className="font-body text-xs text-muted-foreground w-14 text-right">₱{(item.price * item.qty).toLocaleString()}</span>
            <button onClick={() => removeItem(i)} className="w-7 h-7 flex items-center justify-center rounded text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
      {editItems.length > 0 && (
        <Button size="sm" onClick={() => onSave(editItems)} className="w-full mt-2 font-display text-xs tracking-wider min-h-[36px]">
          Save Changes
        </Button>
      )}
      {editItems.length === 0 && (
        <p className="font-body text-xs text-destructive text-center py-2">All items removed — delete this order instead</p>
      )}
    </div>
  );
};

const TabInvoice = ({ tabId, onClose, isAdmin }: TabInvoiceProps) => {
  const qc = useQueryClient();
  const { data: profile } = useResortProfile();
  const { data: invoiceSettings } = useInvoiceSettings();
  const { data: billingConfig } = useBillingConfig();
  const { data: paymentMethodsList = [] } = usePaymentMethods();
  const activePaymentMethods = paymentMethodsList.filter(m => m.is_active);
  const brandName = profile?.resort_name || 'Resort';
  const [paymentMethod, setPaymentMethod] = useState('');
  const [closing, setClosing] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<string | null>(null);
  const [confirmDeleteTab, setConfirmDeleteTab] = useState(false);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);

  const { data: tab } = useQuery({
    queryKey: ['tab', tabId],
    queryFn: async () => {
      const { data } = await supabase.from('tabs').select('*').eq('id', tabId).single();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['tab-orders', tabId],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('tab_id', tabId)
        .order('created_at', { ascending: true });
      return data || [];
    },
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items-available'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .order('category')
        .order('sort_order');
      return data || [];
    },
    enabled: addingItems,
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['menu-categories-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return data || [];
    },
    enabled: addingItems,
  });

  const groupedMenu = useMemo(() => {
    const groups: Record<string, typeof menuItems> = {};
    menuItems.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    // Sort by category sort_order
    const catOrder = menuCategories.reduce((acc: Record<string, number>, c: any) => {
      acc[c.name] = c.sort_order;
      return acc;
    }, {});
    return Object.entries(groups).sort(([a], [b]) => (catOrder[a] || 0) - (catOrder[b] || 0));
  }, [menuItems, menuCategories]);

  if (!tab) return null;

  const scPct = billingConfig?.enable_service_charge ? (billingConfig.service_charge_rate ?? 10) : (invoiceSettings?.service_charge_pct ?? 10);
  const subtotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalServiceCharge = orders.reduce((s, o) => s + Number(o.service_charge || 0), 0);
  const grandTotal = subtotal + totalServiceCharge;

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartServiceCharge = Math.round(cartTotal * (scPct / 100));

  const updateCart = (item: { id: string; name: string; price: number }, delta: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        const newQty = existing.qty + delta;
        if (newQty <= 0) return prev.filter(c => c.id !== item.id);
        return prev.map(c => c.id === item.id ? { ...c, qty: newQty } : c);
      }
      if (delta > 0) return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
      return prev;
    });
  };

  const getCartQty = (id: string) => cart.find(c => c.id === id)?.qty || 0;

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.map(c => ({ name: c.name, price: c.price, qty: c.qty }));
      const total = cartTotal;
      const serviceCharge = cartServiceCharge;

      await supabase.from('orders').insert({
        tab_id: tabId,
        order_type: tab.location_type,
        location_detail: tab.location_detail,
        items,
        total,
        service_charge: serviceCharge,
        status: 'New',
      });

      setCart([]);
      setAddingItems(false);
      qc.invalidateQueries({ queryKey: ['tab-orders', tabId] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      qc.invalidateQueries({ queryKey: ['orders-staff'] });
      toast.success('Order added to tab');
    } catch {
      toast.error('Failed to add order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTab = async () => {
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    setClosing(true);
    try {
      await supabase.from('tabs').update({
        status: 'Closed',
        payment_method: paymentMethod,
        closed_at: new Date().toISOString(),
      }).eq('id', tabId);

      const orderIds = orders.map(o => o.id);
      if (orderIds.length > 0) {
        await supabase.from('orders').update({
          status: 'Paid',
          payment_type: paymentMethod,
          closed_at: new Date().toISOString(),
        }).in('id', orderIds);
      }

      qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      toast.success('Tab closed and settled');
      onClose();
    } catch {
      toast.error('Failed to close tab');
    } finally {
      setClosing(false);
    }
  };

  const deleteOrderFromTab = async (orderId: string) => {
    try {
      await supabase.from('orders').delete().eq('id', orderId);
      qc.invalidateQueries({ queryKey: ['tab-orders', tabId] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      setConfirmDeleteOrder(null);
      toast.success('Order removed from tab');
    } catch {
      toast.error('Failed to delete order');
    }
  };

  const deleteEntireTab = async () => {
    try {
      // Delete all orders in the tab first
      const orderIds = orders.map(o => o.id);
      if (orderIds.length > 0) {
        await supabase.from('orders').delete().in('id', orderIds);
      }
      await supabase.from('tabs').delete().eq('id', tabId);
      qc.invalidateQueries({ queryKey: ['tabs-admin'] });
      qc.invalidateQueries({ queryKey: ['orders-admin'] });
      toast.success('Tab deleted');
      onClose();
    } catch {
      toast.error('Failed to delete tab');
    }
  };

  const updateOrderItems = async (orderId: string, updatedItems: OrderItem[]) => {
    const newTotal = updatedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const newSc = Math.round(newTotal * (scPct / 100));
    await supabase.from('orders').update({
      items: updatedItems as any,
      total: newTotal,
      service_charge: newSc,
    }).eq('id', orderId);
    qc.invalidateQueries({ queryKey: ['tab-orders', tabId] });
    qc.invalidateQueries({ queryKey: ['orders-admin'] });
    setEditingOrder(null);
    toast.success('Order updated');
  };

  const combinedOrder = {
    id: tabId,
    order_type: tab.location_type,
    location_detail: tab.location_detail,
    items: orders.flatMap(o => (Array.isArray(o.items) ? o.items : []) as unknown as OrderItem[]),
    total: grandTotal - totalServiceCharge,
    service_charge: totalServiceCharge,
    payment_type: tab.payment_method,
    created_at: tab.created_at,
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onClose} className="flex items-center gap-2 text-cream-dim hover:text-foreground font-body text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Tabs
      </button>

      {/* Invoice header */}
      <div className="border border-border rounded-lg p-4 bg-secondary/30">
        {profile?.logo_url && (
          <img src={profile.logo_url} alt={brandName} className="w-10 h-10 object-contain mb-2" />
        )}
        <p className="font-display text-base text-foreground">{brandName}</p>
        {profile?.address && <p className="font-body text-[11px] text-cream-dim mt-0.5">{profile.address}</p>}
        {profile?.phone && <p className="font-body text-[11px] text-cream-dim">{profile.phone}</p>}

        <div className="flex justify-between items-start mt-3">
          <div className="flex gap-2">
            <span className="font-body text-[11px] bg-secondary px-2 py-0.5 rounded text-cream-dim">
              {TYPE_LABELS[tab.location_type] || tab.location_type}
            </span>
            <span className="font-body text-[11px] bg-secondary px-2 py-0.5 rounded text-cream-dim">
              {tab.location_detail}
            </span>
          </div>
          <div className="text-right">
            <p className="font-body text-[11px] text-cream-dim">
              {format(new Date(tab.created_at), 'MMM d, yyyy')}
            </p>
            <p className="font-body text-[11px] text-cream-dim">
              {format(new Date(tab.created_at), 'h:mm a')}
            </p>
          </div>
        </div>

        {tab.guest_name && (
          <p className="font-body text-sm text-foreground mt-2">{tab.guest_name}</p>
        )}
        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-display tracking-wider ${
          tab.status === 'Open' ? 'bg-green-900/50 text-green-300' : 'bg-muted text-cream-dim'
        }`}>
          {tab.status}
        </span>
      </div>

      {/* Add Items button (only for open tabs) */}
      {tab.status === 'Open' && !addingItems && (
        <Button onClick={() => setAddingItems(true)} variant="outline" className="w-full font-display tracking-wider gap-2 min-h-[44px]">
          <Plus className="w-4 h-4" /> Add Items to Tab
        </Button>
      )}

      {/* Add Items panel */}
      {addingItems && (
        <div className="border border-gold/40 rounded-lg p-3 space-y-3 bg-gold/5">
          <div className="flex justify-between items-center">
            <p className="font-display text-sm tracking-wider text-gold">Add Items</p>
            <button onClick={() => { setAddingItems(false); setCart([]); }} className="text-cream-dim hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Menu items grouped by category */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {groupedMenu.map(([category, items]) => (
              <div key={category}>
                <p className="font-display text-xs tracking-wider text-cream-dim uppercase mb-1">{category}</p>
                <div className="space-y-1">
                  {items.map(item => {
                    const qty = getCartQty(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-foreground truncate">{item.name}</p>
                          <p className="font-body text-xs text-cream-dim">₱{item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {qty > 0 && (
                            <>
                              <button onClick={() => updateCart(item, -1)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md bg-secondary text-foreground hover:bg-destructive/20">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-display text-sm text-foreground w-6 text-center">{qty}</span>
                            </>
                          )}
                          <button onClick={() => updateCart(item, 1)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md bg-secondary text-foreground hover:bg-gold/20">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Cart summary + submit */}
          {cart.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              {cart.map(c => (
                <div key={c.id} className="flex justify-between font-body text-sm">
                  <span className="text-foreground">{c.qty}× {c.name}</span>
                  <span className="text-cream-dim">₱{(c.price * c.qty).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-body text-xs text-cream-dim">
                <span>Subtotal: ₱{cartTotal.toLocaleString()}</span>
                <span>SC: ₱{cartServiceCharge.toLocaleString()}</span>
              </div>
              <Button onClick={submitOrder} disabled={submitting} className="w-full font-display tracking-wider gap-2 min-h-[44px]">
                <ShoppingCart className="w-4 h-4" />
                {submitting ? 'Adding...' : `Add Order — ₱${(cartTotal + cartServiceCharge).toLocaleString()}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Orders grouped */}
      {orders.map((order, idx) => {
        const items = (Array.isArray(order.items) ? order.items : []) as unknown as OrderItem[];
        const isEditing = editingOrder === order.id;
        return (
          <div key={order.id} className="border border-border rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-display text-xs text-cream-dim tracking-wider">
                Order #{idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-body text-[10px] text-cream-dim">
                  {format(new Date(order.created_at), 'MMM d, h:mm a')}
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingOrder(isEditing ? null : order.id)}
                      className="font-body text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border hover:border-foreground/30 transition-colors"
                    >
                      {isEditing ? 'Cancel' : 'Adjust'}
                    </button>
                    {confirmDeleteOrder === order.id ? (
                      <button
                        onClick={() => deleteOrderFromTab(order.id)}
                        className="font-body text-[10px] text-destructive hover:text-destructive px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/10 animate-pulse"
                      >
                        Confirm?
                      </button>
                    ) : (
                      <button
                        onClick={() => { setConfirmDeleteOrder(order.id); setTimeout(() => setConfirmDeleteOrder(null), 3000); }}
                        className="font-body text-[10px] text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded border border-border hover:border-destructive/40 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {isEditing ? (
              <EditableOrderItems items={items} onSave={(updated) => updateOrderItems(order.id, updated)} />
            ) : (
              <>
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between font-body text-sm py-0.5">
                    <span className="text-foreground">{item.qty}x {item.name}</span>
                    <span className="text-foreground">₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
            <div className="flex justify-between font-body text-xs text-cream-dim mt-1 pt-1 border-t border-border/50">
              <span>Subtotal: ₱{Number(order.total).toLocaleString()}</span>
              <span>SC: ₱{Number(order.service_charge || 0).toLocaleString()}</span>
            </div>
          </div>
        );
      })}

      {/* Grand totals */}
      <div className="border border-border rounded-lg p-3 bg-secondary/30">
        <div className="flex justify-between font-body text-sm mb-1">
          <span className="text-cream-dim">Subtotal</span>
          <span className="text-foreground">₱{subtotal.toLocaleString()}</span>
        </div>
        {(invoiceSettings?.show_service_charge !== false) && (
          <div className="flex justify-between font-body text-sm mb-2">
            <span className="text-cream-dim">Service Charge ({scPct}%)</span>
            <span className="text-foreground">₱{totalServiceCharge.toLocaleString()}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-display text-xl tracking-wider mt-2">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">₱{grandTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Invoice footer info */}
      {orders.length > 0 && (
        <div className="text-center space-y-1 py-2">
          <p className="font-body text-xs text-cream-dim">{invoiceSettings?.thank_you_message || 'Thank you for dining with us!'}</p>
          {invoiceSettings?.business_hours && <p className="font-body text-[10px] text-cream-dim">{invoiceSettings.business_hours}</p>}
          {(profile?.instagram_url || profile?.website_url) && (
            <p className="font-body text-[10px] text-cream-dim">
              {[profile?.instagram_url && `IG: ${profile.instagram_url.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}`, profile?.website_url].filter(Boolean).join('  |  ')}
            </p>
          )}
          {invoiceSettings?.tin_number && <p className="font-body text-[10px] text-cream-dim">TIN: {invoiceSettings.tin_number}</p>}
        </div>
      )}

      {/* Invoice download/share */}
      {orders.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 font-body text-xs gap-1.5 min-h-[44px]"
            onClick={async () => {
              try {
                await generateInvoicePdf(combinedOrder, profile ?? null, invoiceSettings);
                toast.success('Invoice downloaded');
              } catch { toast.error('Failed to generate invoice'); }
            }}>
            <Download className="w-4 h-4" /> Download Invoice
          </Button>
          <Button variant="outline" className="flex-1 font-body text-xs gap-1.5 min-h-[44px]"
            onClick={() => {
              const text = buildInvoiceWhatsAppText(combinedOrder, profile ?? null, invoiceSettings);
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }}>
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </Button>
        </div>
      )}

      {/* Close tab (only if open) */}
      {tab.status === 'Open' && (() => {
        const isRoomTab = /^(COT|SUI)/i.test(tab.location_detail || '');

        const handleRoomFolio = async () => {
          setClosing(true);
          try {
            const staffSession = getStaffSession();
            const staffName = staffSession?.name || 'Staff';
            const today = new Date().toISOString().slice(0, 10);

            const { data: bookings } = await supabase
              .from('resort_ops_bookings')
              .select('id, unit_id, guest_id, resort_ops_guests(full_name), resort_ops_units:unit_id(name)')
              .lte('check_in', today)
              .gte('check_out', today)
              .limit(50);

            const loc = (tab.location_detail || '').trim().toLowerCase();
            const booking = (bookings || []).find((b: any) => {
              const unitName = b.resort_ops_units?.name?.trim()?.toLowerCase();
              return unitName && unitName === loc;
            }) as any;

            await supabase.from('tabs').update({
              status: 'Closed',
              payment_method: 'Charge to Room',
              closed_at: new Date().toISOString(),
            }).eq('id', tabId);

            const orderIds = orders.map(o => o.id);
            if (orderIds.length > 0) {
              await supabase.from('orders').update({
                status: 'Paid',
                payment_type: 'Charge to Room',
                closed_at: new Date().toISOString(),
                ...(booking?.unit_id ? { room_id: booking.unit_id } : {}),
              }).in('id', orderIds);
            }

            for (const order of orders) {
              const orderItems = (Array.isArray(order.items) ? order.items : []) as unknown as OrderItem[];
              const orderSubtotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
              const orderSc = Number(order.service_charge || 0);
              const orderTotal = orderSubtotal + orderSc;

              await (supabase.from('room_transactions' as any) as any).insert({
                unit_id: booking?.unit_id || null,
                unit_name: booking?.resort_ops_units?.name || tab.location_detail || '',
                guest_name: booking?.resort_ops_guests?.full_name || tab.guest_name || '',
                booking_id: booking?.id || null,
                transaction_type: 'room_charge',
                order_id: order.id,
                amount: orderSubtotal,
                tax_amount: 0,
                service_charge_amount: orderSc,
                total_amount: orderTotal,
                payment_method: 'Charge to Room',
                staff_name: staffName,
                notes: `Tab settlement — ${tab.location_detail || tab.location_type}`,
              });
            }

            qc.invalidateQueries({ queryKey: ['tabs-admin'] });
            qc.invalidateQueries({ queryKey: ['orders-admin'] });
            qc.invalidateQueries({ queryKey: ['room-transactions'] });
            toast.success('Tab settled — charged to room folio');
            onClose();
          } catch {
            toast.error('Failed to settle tab');
          } finally {
            setClosing(false);
          }
        };

        return (
          <div className="space-y-3 pt-2">
            {isRoomTab && (
              <>
                <Button
                  onClick={handleRoomFolio}
                  disabled={closing}
                  className="w-full font-display tracking-wider py-5 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <BedDouble className="w-4 h-4" />
                  {closing ? 'Settling...' : `Room Folio — ${tab.location_detail}`}
                </Button>
                <div className="flex items-center gap-2">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground font-display tracking-wider">OR PAY NOW</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}
            <Select onValueChange={setPaymentMethod} value={paymentMethod}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {activePaymentMethods.map(m => (
                  <SelectItem key={m.id} value={m.name} className="text-foreground font-body">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCloseTab} disabled={closing} className="font-display tracking-wider w-full py-5" variant="default">
              <X className="w-4 h-4 mr-2" />
              {closing ? 'Closing...' : 'Close Tab & Settle'}
            </Button>
          </div>
        );
      })()}

      {tab.status === 'Closed' && tab.payment_method && (
        <div className="text-center py-2">
          <p className="font-body text-sm text-cream-dim">
            Settled via <span className="text-foreground font-display">{tab.payment_method}</span>
          </p>
          {tab.closed_at && (
            <p className="font-body text-[10px] text-cream-dim">
              {format(new Date(tab.closed_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>
      )}

      {/* Admin: Delete entire tab */}
      {isAdmin && (
        <div className="pt-2">
          {confirmDeleteTab ? (
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1 font-display text-xs tracking-wider min-h-[44px] animate-pulse" onClick={deleteEntireTab}>
                <Trash2 className="w-4 h-4 mr-1" /> Confirm Delete Tab
              </Button>
              <Button variant="outline" className="font-body text-xs min-h-[44px]" onClick={() => setConfirmDeleteTab(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full font-body text-xs gap-1.5 min-h-[44px] border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteTab(true)}>
              <Trash2 className="w-4 h-4" /> Delete Entire Tab
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default TabInvoice;
