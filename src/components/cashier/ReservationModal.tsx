import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notifyTelegram } from '@/lib/telegram';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Calendar, Clock, Users, Cake, Phone, Mail, Utensils, Coffee, Plus, X } from 'lucide-react';

interface ReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
}

const ReservationModal = ({ open, onOpenChange }: ReservationModalProps) => {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [preOrders, setPreOrders] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    guest_name: '',
    reservation_date: '',
    reservation_time: '19:00',
    pax: 2,
    occasion: '',
    contact_number: '',
    email: '',
    notes: '',
    reservation_type: 'dinner',
  });

  // Fetch menu items
  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu-items-for-reservation'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('id, name, price, category')
        .eq('available', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      return data || [];
    },
    enabled: showMenu,
  });

  const addToPreOrder = (item: MenuItem) => {
    setPreOrders(prev => {
      const existing = prev.find(p => p.id === item.id);
      if (existing) {
        return prev.map(p => p.id === item.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromPreOrder = (itemId: string) => {
    setPreOrders(prev => prev.filter(p => p.id !== itemId));
  };

  const updateQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromPreOrder(itemId);
      return;
    }
    setPreOrders(prev => prev.map(p => p.id === itemId ? { ...p, qty } : p));
  };

  const preOrderTotal = preOrders.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const handleSubmit = async () => {
    if (!formData.guest_name.trim()) {
      toast.error('Guest name is required');
      return;
    }
    if (!formData.reservation_date) {
      toast.error('Reservation date is required');
      return;
    }
    if (!formData.reservation_time) {
      toast.error('Reservation time is required');
      return;
    }
    
    setLoading(true);
    
    try {
      const { error, data } = await supabase
        .from('dining_reservations')
        .insert({
          guest_name: formData.guest_name,
          reservation_date: formData.reservation_date,
          reservation_time: formData.reservation_time,
          pax: formData.pax,
          occasion: formData.occasion || null,
          contact_number: formData.contact_number || null,
          email: formData.email || null,
          notes: formData.notes || null,
          reservation_type: formData.reservation_type,
          pre_orders: preOrders.length > 0 ? preOrders : null,
          status: 'pending',
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Send Telegram notification
      const preOrderText = preOrders.length > 0 
        ? `\n📋 Pre-order: ${preOrders.length} items (₱${preOrderTotal.toLocaleString()})` 
        : '';
      
      const occasionText = formData.occasion ? `\n🎉 Occasion: ${formData.occasion}` : '';
      const notesText = formData.notes ? `\n📝 Notes: ${formData.notes}` : '';
      const contactText = formData.contact_number ? `\n📞 Contact: ${formData.contact_number}` : '';
      
      const message = `📅 NEW ${formData.reservation_type.toUpperCase()} RESERVATION\n\n` +
        `👤 Guest: ${formData.guest_name}\n` +
        `📆 Date: ${formData.reservation_date}\n` +
        `⏰ Time: ${formData.reservation_time}\n` +
        `👥 Pax: ${formData.pax}\n` +
        `${occasionText}${contactText}${preOrderText}${notesText}`;
      
      await notifyTelegram('reception,managers,staffops,kitchen,waitstaff', message);
      
      toast.success(`${formData.reservation_type === 'catering' ? 'Catering' : 'Dinner'} reservation created for ${formData.guest_name}`);
      onOpenChange(false);
      setFormData({
        guest_name: '',
        reservation_date: '',
        reservation_time: '19:00',
        pax: 2,
        occasion: '',
        contact_number: '',
        email: '',
        notes: '',
        reservation_type: 'dinner',
      });
      setPreOrders([]);
      qc.invalidateQueries({ queryKey: ['dining-reservations'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to create reservation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-wider">New Reservation</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Reservation Type Toggle */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground">Reservation Type</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, reservation_type: 'dinner' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border-2 transition-all ${
                    formData.reservation_type === 'dinner'
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-border bg-card text-muted-foreground hover:border-gold/50'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  <span className="font-display text-sm">Dinner</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, reservation_type: 'catering' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border-2 transition-all ${
                    formData.reservation_type === 'catering'
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-border bg-card text-muted-foreground hover:border-gold/50'
                  }`}
                >
                  <Coffee className="w-4 h-4" />
                  <span className="font-display text-sm">Catering</span>
                </button>
              </div>
            </div>

            {/* Guest Name */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground">Guest Name *</Label>
              <Input
                placeholder="Full name"
                value={formData.guest_name}
                onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>
            
            {/* Reservation Date */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Reservation Date *
              </Label>
              <Input
                type="date"
                value={formData.reservation_date}
                onChange={(e) => setFormData({ ...formData, reservation_date: e.target.value })}
                className="bg-secondary border-border"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            
            {/* Reservation Time */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> Reservation Time *
              </Label>
              <select
                value={formData.reservation_time}
                onChange={(e) => setFormData({ ...formData, reservation_time: e.target.value })}
                className="w-full bg-secondary border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="17:00">5:00 PM</option>
                <option value="17:30">5:30 PM</option>
                <option value="18:00">6:00 PM</option>
                <option value="18:30">6:30 PM</option>
                <option value="19:00">7:00 PM</option>
                <option value="19:30">7:30 PM</option>
                <option value="20:00">8:00 PM</option>
                <option value="20:30">8:30 PM</option>
                <option value="21:00">9:00 PM</option>
              </select>
            </div>
            
            {/* Pax */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Number of Guests *
              </Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={formData.pax}
                onChange={(e) => setFormData({ ...formData, pax: parseInt(e.target.value) || 1 })}
                className="bg-secondary border-border w-24"
              />
            </div>
            
            {/* Occasion */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Cake className="w-4 h-4" /> Occasion (Optional)
              </Label>
              <select
                value={formData.occasion}
                onChange={(e) => setFormData({ ...formData, occasion: e.target.value })}
                className="w-full bg-secondary border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">Select occasion</option>
                <option value="Birthday">Birthday</option>
                <option value="Anniversary">Anniversary</option>
                <option value="Date Night">Date Night</option>
                <option value="Family Dinner">Family Dinner</option>
                <option value="Business Dinner">Business Dinner</option>
                <option value="Wedding">Wedding</option>
                <option value="Corporate Event">Corporate Event</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            {/* Contact Number */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" /> Contact Number
              </Label>
              <Input
                placeholder="+63 XXX XXX XXXX"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>
            
            {/* Email */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email
              </Label>
              <Input
                type="email"
                placeholder="guest@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>

            {/* Pre-order Section */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="font-body text-sm text-foreground">Pre-order (Optional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMenu(true)}
                  className="gap-1 h-8 text-xs"
                >
                  <Plus className="w-3 h-3" /> Add Items
                </Button>
              </div>
              
              {preOrders.length > 0 && (
                <div className="space-y-2 bg-secondary/30 rounded-lg p-3">
                  {preOrders.map(item => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-body text-sm">{item.name}</p>
                        <p className="font-body text-xs text-muted-foreground">₱{item.price}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.qty - 1)}
                          className="w-6 h-6 rounded-full bg-secondary text-foreground"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-sm">{item.qty}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.qty + 1)}
                          className="w-6 h-6 rounded-full bg-secondary text-foreground"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromPreOrder(item.id)}
                          className="w-6 h-6 rounded-full text-destructive hover:bg-destructive/10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="font-body text-sm text-muted-foreground">Pre-order Total</span>
                    <span className="font-display text-sm text-gold">₱{preOrderTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label className="font-body text-sm text-foreground">Special Requests / Notes</Label>
              <Textarea
                placeholder="Dietary restrictions, special arrangements, etc."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-secondary border-border min-h-[80px]"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="bg-gold text-background hover:bg-gold/90">
              {loading ? 'Creating...' : 'Create Reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu Selection Modal */}
      <Dialog open={showMenu} onOpenChange={setShowMenu}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg tracking-wider">Select Pre-order Items</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {menuItems.map((item: MenuItem) => {
              const selected = preOrders.find(p => p.id === item.id);
              return (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <p className="font-body text-sm text-foreground">{item.name}</p>
                    <p className="font-body text-xs text-muted-foreground">₱{item.price}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() => addToPreOrder(item)}
                    className={selected ? "bg-gold text-background" : ""}
                  >
                    {selected ? `✓ ${selected.qty}` : 'Add'}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowMenu(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReservationModal;
