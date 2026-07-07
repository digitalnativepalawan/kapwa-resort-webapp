import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResortProfile } from '@/hooks/useResortProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogOut, UtensilsCrossed, MapPin, Car, Bike, MessageSquare, Star, Receipt, ArrowLeft, ChevronRight, ClipboardList, Calendar, Clock, Users, StickyNote, CheckCircle2, Utensils, Palmtree, Truck, CreditCard, FileText, Loader2, ConciergeBell, AlertTriangle, Bell, Info, Phone, Mail, MapPinned, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { setGuestSession } from '@/hooks/useGuestSession';
import AgentChatPanel from '@/components/AgentChatPanel';

const GUEST_PORTAL_KEY = 'guest_portal_session';

interface GuestPortalSession {
  booking_id: string;
  room_id: string;
  room_name: string;
  guest_name: string;
  check_out: string;
  expires: number;
}

const getPortalSession = (): GuestPortalSession | null => {
  try {
    const s = sessionStorage.getItem(GUEST_PORTAL_KEY);
    if (!s) return null;
    const parsed: GuestPortalSession = JSON.parse(s);
    if (parsed.expires < Date.now()) { sessionStorage.removeItem(GUEST_PORTAL_KEY); return null; }
    return parsed;
  } catch { sessionStorage.removeItem(GUEST_PORTAL_KEY); return null; }
};

const GuestPortal = () => {
  const navigate = useNavigate();
  const { data: profile } = useResortProfile();
  const qc = useQueryClient();
  const [session, setSession] = useState<GuestPortalSession | null>(getPortalSession);
  const [view, setView] = useState<'dashboard' | 'menu-food' | 'menu-drinks' | 'experiences' | 'request' | 'message' | 'tours' | 'transport' | 'rentals' | 'review' | 'bill' | 'orders' | 'requests' | 'hotel-info' | 'reservation'>('dashboard');

  // Login state
  const [roomName, setRoomName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: allUnits = [] } = useQuery({
    queryKey: ['active-units-portal'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('id, unit_name').eq('active', true).order('unit_name');
      return data || [];
    },
    enabled: !session,
  });

  const handleLogin = async () => {
    if (!roomName || !lastName.trim()) return;
    setLoading(true);
    try {
      const unit = allUnits.find(u => u.unit_name === roomName);
      if (!unit) { toast.error('Room not found'); setLoading(false); return; }

      const { data: opsUnit } = await supabase.from('resort_ops_units').select('id').ilike('name', roomName.trim()).maybeSingle();
      if (!opsUnit) { toast.error('Room not found'); setLoading(false); return; }

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const { data: bookings } = await supabase
        .from('resort_ops_bookings')
        .select('id, check_in, check_out, guest_login_count, resort_ops_guests(full_name)')
        .eq('unit_id', opsUnit.id)
        .lte('check_in', today)
        .gte('check_out', today);

      if (!bookings || bookings.length === 0) { toast.error('No active booking found for this room'); setLoading(false); return; }

      const enteredLast = lastName.trim().toLowerCase();
      const booking = bookings.find((b: any) => {
        const fullName = b.resort_ops_guests?.full_name || '';
        const bLast = fullName.split(' ').pop()?.toLowerCase() || '';
        return bLast === enteredLast;
      });

      if (!booking) {
        toast.error('Last name does not match our records');
        setLoading(false);
        return;
      }
      const guestName = (booking as any).resort_ops_guests?.full_name || '';

      await (supabase.from('resort_ops_bookings') as any).update({
        last_guest_login: new Date().toISOString(),
        guest_login_count: (booking as any).guest_login_count ? (booking as any).guest_login_count + 1 : 1,
      }).eq('id', booking.id);

      const portalSession: GuestPortalSession = {
        booking_id: booking.id,
        room_id: unit.id,
        room_name: unit.unit_name,
        guest_name: guestName,
        check_out: booking.check_out,
        expires: new Date(booking.check_out + 'T23:59:59').getTime(),
      };
      sessionStorage.setItem(GUEST_PORTAL_KEY, JSON.stringify(portalSession));
      setSession(portalSession);
      toast.success(`Welcome, ${guestName.split(' ')[0]}!`);
    } catch { toast.error('Login failed'); }
    setLoading(false);
  };

  const logout = () => {
    sessionStorage.removeItem(GUEST_PORTAL_KEY);
    setSession(null);
    setView('dashboard');
  };

  // Booking details for Upcoming Stay card (adults, children, check_in)
  const { data: bookingDetails } = useQuery({
    queryKey: ['guest-portal-booking', session?.booking_id],
    queryFn: async () => {
      if (!session) return null;
      const { data } = await supabase
        .from('resort_ops_bookings')
        .select('check_in, check_out, adults, children, platform')
        .eq('id', session.booking_id)
        .maybeSingle();
      return data;
    },
    enabled: !!session,
  });

  // Notification badge: open requests + active orders for this booking
  const { data: notifCount = 0 } = useQuery({
    queryKey: ['guest-portal-notifs', session?.booking_id],
    queryFn: async () => {
      if (!session) return 0;
      const [reqs, orders] = await Promise.all([
        supabase.from('guest_requests').select('id', { count: 'exact', head: true })
          .eq('booking_id', session.booking_id).in('status', ['pending', 'in_progress']),
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .eq('room_id', session.room_id).in('status', ['New', 'Preparing', 'Ready']),
      ]);
      return (reqs.count || 0) + (orders.count || 0);
    },
    enabled: !!session,
    refetchInterval: 15000,
  });

  if (!session) {
    return (
      <div className="min-h-screen bg-navy-texture flex flex-col items-center justify-center px-6">
        {profile?.logo_url && <img src={profile.logo_url} alt="Logo" style={{ width: profile.logo_size || 96, height: profile.logo_size || 96 }} className="object-contain mb-4" />}
        <h1 className="font-display text-2xl tracking-wider text-foreground mb-1">Guest Portal</h1>
        <p className="font-body text-sm text-muted-foreground mb-8">Access your room services</p>
        <div className="w-full max-w-xs space-y-3">
          <Select onValueChange={setRoomName} value={roomName}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body text-center h-12">
              <SelectValue placeholder="Select your room" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {allUnits.map(u => <SelectItem key={u.id} value={u.unit_name} className="text-foreground font-body">{u.unit_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Your last name" className="bg-secondary border-border text-foreground font-body text-center text-lg h-12" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <Button onClick={handleLogin} disabled={loading || !roomName || !lastName.trim()} className="w-full font-display text-sm tracking-wider h-12">
            {loading ? 'Verifying...' : 'Enter Portal'}
          </Button>
          <button onClick={() => navigate('/')} className="w-full font-body text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient gradient layer */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 90% 55% at 50% -10%, hsl(var(--gold) / 0.12), transparent 60%),' +
            'radial-gradient(ellipse 70% 50% at 100% 100%, hsl(var(--teal) / 0.10), transparent 70%),' +
            'linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--navy-deep)) 100%)',
        }}
      />
      <div className="max-w-lg mx-auto px-4 py-6">
        {view !== 'dashboard' ? (
          <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-body text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <>
            {/* ── Top header: greeting + bell + avatar ── */}
            <header className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                {profile?.logo_url && (
                  <img src={profile.logo_url} alt={profile?.resort_name || 'Logo'} className="w-12 h-12 object-contain shrink-0" />
                )}
                <div className="min-w-0">
                  <h1 className="font-serif-display text-2xl text-foreground leading-tight truncate">
                    Hello, {session.guest_name.split(' ')[0]}! <span>👋</span>
                  </h1>
                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                    Welcome to <span className="text-gold">{profile?.resort_name || 'KAPWA OS Boutique'}</span>
                  </p>
                  <p className="font-body text-[11px] text-muted-foreground">
                    We're here to make your stay exceptional.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setView('requests')}
                  aria-label="Notifications"
                  className="relative w-10 h-10 rounded-full luxury-glass flex items-center justify-center hover:border-gold/40 transition-colors"
                >
                  <Bell className="w-4 h-4 text-foreground" />
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/40 to-teal/40 border border-gold/40 flex items-center justify-center">
                  <span className="font-serif-display text-sm text-foreground">
                    {session.guest_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
              </div>
            </header>

            {/* ── Upcoming Stay card ── */}
            <div className="luxury-glass rounded-2xl overflow-hidden mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {/* Hero image / gradient panel */}
                <div className="relative h-44 sm:h-auto sm:min-h-[220px] overflow-hidden">
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(135deg, hsl(220 40% 8%) 0%, hsl(var(--teal) / 0.5) 50%, hsl(38 80% 45%) 100%)',
                    }}
                  />
                  <svg aria-hidden viewBox="0 0 400 220" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-50">
                    <circle cx="320" cy="60" r="32" fill="hsl(38 90% 65%)" opacity="0.7" />
                    <path d="M0 170 Q 80 140 160 165 T 320 160 T 460 175 L 460 220 L 0 220 Z" fill="hsl(220 60% 10%)" />
                    <path d="M0 195 Q 100 175 200 190 T 400 185 L 400 220 L 0 220 Z" fill="hsl(220 50% 6%)" />
                  </svg>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <Palmtree className="w-6 h-6 text-gold/70" />
                  </div>
                </div>
                {/* Stay details */}
                <div className="p-5">
                  <p className="font-body text-[10px] tracking-[0.28em] uppercase text-gold/80 mb-1">Current Stay</p>
                  <h2 className="font-serif-display text-2xl text-foreground leading-tight">{session.room_name}</h2>
                  <p className="font-body text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {bookingDetails?.platform || 'Ocean View'}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Check-In
                      </p>
                      <p className="font-serif-display text-base text-foreground mt-0.5">
                        {bookingDetails?.check_in
                          ? new Date(bookingDetails.check_in + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                      <p className="font-body text-[10px] text-muted-foreground">3:00 PM</p>
                    </div>
                    <div>
                      <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Check-Out
                      </p>
                      <p className="font-serif-display text-base text-foreground mt-0.5">
                        {new Date(session.check_out + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="font-body text-[10px] text-muted-foreground">11:00 AM</p>
                    </div>
                  </div>

                  <div className="border-t border-border/40 mt-4 pt-3 flex items-center gap-4 text-xs">
                    <span className="font-body text-foreground/80 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      {bookingDetails?.adults ?? 1} Adult{(bookingDetails?.adults ?? 1) !== 1 ? 's' : ''}
                      {bookingDetails?.children ? `, ${bookingDetails.children} Child${bookingDetails.children !== 1 ? 'ren' : ''}` : ''}
                    </span>
                    {bookingDetails?.check_in && (() => {
                      const nights = Math.max(1, Math.round((new Date(session.check_out).getTime() - new Date(bookingDetails.check_in).getTime()) / 86400000));
                      return (
                        <span className="font-body text-foreground/80 flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                          {nights} Night{nights !== 1 ? 's' : ''}
                        </span>
                      );
                    })()}
                  </div>

                  <button
                    type="button"
                    onClick={() => setView('reservation')}
                    className="mt-4 w-full flex items-center justify-center gap-2 font-display text-xs tracking-[0.2em] uppercase text-gold border border-gold/40 rounded-xl py-2.5 hover:bg-gold/10 transition-colors min-h-[44px]"
                  >
                    View Reservation <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── How can we help you today? ── */}
            <div className="luxury-glass rounded-2xl p-5 mb-5">
              <h3 className="font-serif-display text-xl text-foreground mb-4">How can we help you today?</h3>
              <div className="flex flex-col gap-3">
                <GuestTile
                  icon={<UtensilsCrossed className="w-6 h-6" />}
                  label="Order Food"
                  subtitle="Browse our menu and order to your room"
                  onClick={() => {
                    setGuestSession({ room_id: session.room_id, room_name: session.room_name, guest_name: session.guest_name, booking_id: session.booking_id });
                    navigate('/menu?mode=guest-order&dept=kitchen');
                  }}
                />
                <GuestTile
                  icon={<span className="text-2xl">🍹</span>}
                  label="Order Drinks"
                  subtitle="Cocktails, coffee, fresh juices & more"
                  onClick={() => {
                    setGuestSession({ room_id: session.room_id, room_name: session.room_name, guest_name: session.guest_name, booking_id: session.booking_id });
                    navigate('/menu?mode=guest-order&dept=bar');
                  }}
                />
                <GuestTile
                  icon={<Palmtree className="w-6 h-6" />}
                  label="Book Experiences"
                  subtitle="Tours, transport & equipment rental"
                  onClick={() => setView('experiences')}
                />
                <GuestTile
                  icon={<MessageSquare className="w-6 h-6" />}
                  label="Request Service"
                  subtitle="Housekeeping, towels, or anything you need"
                  onClick={() => setView('request')}
                />
                <GuestTile
                  icon={<ConciergeBell className="w-6 h-6" />}
                  label="Message Reception"
                  subtitle="Send a note directly to our front desk"
                  onClick={() => setView('message')}
                />
              </div>
            </div>

            {/* ── Quick access (5 tiles): Orders / Requests / Bill / Reviews / Hotel Info ── */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-6">
              {[
                { icon: ClipboardList, label: 'My Orders', sub: 'Track your orders', onClick: () => setView('orders') },
                { icon: CheckCircle2, label: 'My Requests', sub: 'View your requests', onClick: () => setView('requests') },
                { icon: Receipt, label: 'My Bill', sub: 'Check your statement', onClick: () => setView('bill') },
                { icon: Star, label: 'Reviews', sub: 'Share your experience', onClick: () => setView('review') },
                { icon: Info, label: 'Hotel Info', sub: 'Explore hotel information', onClick: () => setView('hotel-info') },
              ].map(({ icon: Icon, label, sub, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="luxury-glass rounded-xl p-3 flex flex-col items-center gap-1.5 hover:border-gold/40 transition-colors min-h-[96px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                >
                  <Icon className="w-5 h-5 text-gold" />
                  <span className="font-serif-display text-sm text-foreground text-center leading-tight">{label}</span>
                  <span className="font-body text-[10px] text-muted-foreground text-center leading-tight">{sub}</span>
                </button>
              ))}
            </div>

            <button onClick={logout} className="flex items-center justify-center gap-2 w-full font-body text-xs text-gold hover:text-foreground py-3">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>

            <AgentChatPanel />
          </>
        )}

        {/* Experiences hub — combines tours, transport, rentals */}
        {view === 'experiences' && (
          <div className="space-y-4">
            <h2 className="font-display text-lg text-foreground">Book an Experience</h2>
            <p className="font-body text-xs text-muted-foreground">Choose from tours, transport, or equipment rental below.</p>
            <div className="flex flex-col gap-3">
              <GuestTile icon={<MapPin className="w-5 h-5" />} label="Island Tours" subtitle="Explore the best of Palawan" onClick={() => setView('tours')} />
              <GuestTile icon={<Car className="w-5 h-5" />} label="Transport" subtitle="Airport transfers & van hire" onClick={() => setView('transport')} />
              <GuestTile icon={<Bike className="w-5 h-5" />} label="Rent Equipment" subtitle="Scooters, bikes, kayaks & more" onClick={() => setView('rentals')} />
            </div>
          </div>
        )}

        {/* Message reception — simple text-to-reception */}
        {view === 'message' && <MessageReceptionView session={session} qc={qc} onDone={() => setView('dashboard')} />}

        {view === 'tours' && <ToursView session={session} qc={qc} />}
        {view === 'transport' && <TransportView session={session} qc={qc} />}
        {view === 'rentals' && <RentalsView session={session} qc={qc} />}
        {view === 'request' && <RequestView session={session} qc={qc} />}
        {view === 'review' && <ReviewView session={session} qc={qc} onDone={() => setView('dashboard')} />}
        {view === 'orders' && <OrdersView session={session} />}
        {view === 'requests' && <RequestsTrackerView session={session} />}
        {view === 'bill' && <BillView session={session} />}
        {view === 'hotel-info' && <HotelInfoView profile={profile} />}
        {view === 'reservation' && <ReservationDetailsView session={session} booking={bookingDetails} onBill={() => setView('bill')} /> }

      </div>
    </div>
  );
};

/** Large full-width tile for guest concierge */
const GuestTile = ({ icon, label, subtitle, onClick }: { icon: React.ReactNode; label: string; subtitle: string; onClick: () => void }) => (
  <button onClick={onClick} className="w-full bg-card border border-border rounded-lg p-5 flex items-center gap-4 hover:bg-secondary transition-colors text-left">
    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
      <span className="text-accent">{icon}</span>
    </div>
    <div>
      <p className="font-display text-base text-foreground">{label}</p>
      <p className="font-body text-xs text-muted-foreground">{subtitle}</p>
    </div>
  </button>
);

/** Hotel info screen — shows resort profile contact + social links */
const HotelInfoView = ({ profile }: { profile: any }) => (
  <div className="space-y-4">
    <h2 className="font-serif-display text-2xl text-foreground">Hotel Information</h2>
    {profile?.logo_url && (
      <div className="flex justify-center py-2">
        <img src={profile.logo_url} alt={profile?.resort_name || 'Logo'} className="w-20 h-20 object-contain" />
      </div>
    )}
    <div className="luxury-glass rounded-2xl p-5 space-y-4">
      <div>
        <p className="font-body text-[10px] tracking-[0.28em] uppercase text-gold/80 mb-1">Resort</p>
        <p className="font-serif-display text-xl text-foreground">{profile?.resort_name || 'KAPWA OS Boutique'}</p>
        {profile?.tagline && <p className="font-body text-sm text-muted-foreground mt-1">{profile.tagline}</p>}
      </div>
      {profile?.address && (
        <div className="flex items-start gap-3">
          <MapPinned className="w-4 h-4 text-gold mt-0.5 shrink-0" />
          <p className="font-body text-sm text-foreground">{profile.address}</p>
        </div>
      )}
      {profile?.phone && (
        <a href={`tel:${profile.phone}`} className="flex items-center gap-3 hover:text-gold transition-colors">
          <Phone className="w-4 h-4 text-gold shrink-0" />
          <span className="font-body text-sm text-foreground">{profile.phone}</span>
        </a>
      )}
      {profile?.email && (
        <a href={`mailto:${profile.email}`} className="flex items-center gap-3 hover:text-gold transition-colors">
          <Mail className="w-4 h-4 text-gold shrink-0" />
          <span className="font-body text-sm text-foreground">{profile.email}</span>
        </a>
      )}
      {profile?.website_url && (
        <a href={profile.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold transition-colors">
          <Info className="w-4 h-4 text-gold shrink-0" />
          <span className="font-body text-sm text-foreground">{profile.website_url}</span>
        </a>
      )}
    </div>
    {(profile?.facebook_url || profile?.instagram_url || profile?.tiktok_url) && (
      <div className="flex justify-center gap-3">
        {profile?.facebook_url && <a href={profile.facebook_url} target="_blank" rel="noreferrer" className="luxury-glass rounded-full px-4 py-2 font-body text-xs text-foreground hover:border-gold/40">Facebook</a>}
        {profile?.instagram_url && <a href={profile.instagram_url} target="_blank" rel="noreferrer" className="luxury-glass rounded-full px-4 py-2 font-body text-xs text-foreground hover:border-gold/40">Instagram</a>}
        {profile?.tiktok_url && <a href={profile.tiktok_url} target="_blank" rel="noreferrer" className="luxury-glass rounded-full px-4 py-2 font-body text-xs text-foreground hover:border-gold/40">TikTok</a>}
      </div>
    )}
  </div>
);

/** Reservation details screen — summary of current stay */
const ReservationDetailsView = ({ session, booking, onBill }: { session: GuestPortalSession; booking: any; onBill: () => void }) => {
  const nights = booking?.check_in
    ? Math.max(1, Math.round((new Date(session.check_out).getTime() - new Date(booking.check_in).getTime()) / 86400000))
    : 0;
  return (
    <div className="space-y-4">
      <h2 className="font-serif-display text-2xl text-foreground">Your Reservation</h2>
      <div className="luxury-glass rounded-2xl p-5 space-y-4">
        <div>
          <p className="font-body text-[10px] tracking-[0.28em] uppercase text-gold/80 mb-1">Room</p>
          <p className="font-serif-display text-xl text-foreground">{session.room_name}</p>
          <p className="font-body text-xs text-muted-foreground">Guest · {session.guest_name}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4">
          <div>
            <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Check-In</p>
            <p className="font-serif-display text-base text-foreground mt-1">
              {booking?.check_in ? new Date(booking.check_in + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </p>
            <p className="font-body text-[10px] text-muted-foreground">3:00 PM</p>
          </div>
          <div>
            <p className="font-body text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Check-Out</p>
            <p className="font-serif-display text-base text-foreground mt-1">
              {new Date(session.check_out + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="font-body text-[10px] text-muted-foreground">11:00 AM</p>
          </div>
        </div>
        <div className="border-t border-border/40 pt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span className="font-body text-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            {booking?.adults ?? 1} Adult{(booking?.adults ?? 1) !== 1 ? 's' : ''}
            {booking?.children ? `, ${booking.children} Child${booking.children !== 1 ? 'ren' : ''}` : ''}
          </span>
          {nights > 0 && (
            <span className="font-body text-foreground flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-muted-foreground" /> {nights} Night{nights !== 1 ? 's' : ''}
            </span>
          )}
          {booking?.platform && (
            <span className="font-body text-muted-foreground">Booked via {booking.platform}</span>
          )}
        </div>
      </div>
      <button onClick={onBill} className="w-full luxury-glass rounded-xl py-3 font-display text-xs tracking-[0.2em] uppercase text-gold hover:border-gold/40 transition-colors min-h-[44px] flex items-center justify-center gap-2">
        <Receipt className="w-4 h-4" /> View My Bill
      </button>
    </div>
  );
};

/** Simple message-to-reception flow */
const MessageReceptionView = ({ session, qc, onDone }: { session: GuestPortalSession; qc: any; onDone: () => void }) => {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: 'Message',
      details: message.trim(),
      status: 'pending',
    });
    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('reception,managers', `🛎️ Guest Request\n${session.guest_name}\nMessage: ${message.trim()}`);
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    setSubmitting(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="font-display text-lg text-foreground">Message Sent!</p>
        <p className="font-body text-sm text-muted-foreground text-center">Our team will get back to you shortly.</p>
        <Button onClick={onDone} variant="outline" className="font-display tracking-wider mt-4">Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">Message Reception</h2>
      <p className="font-body text-sm text-muted-foreground">Send a message directly to our front desk team.</p>
      <Textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="How can we help you today?"
        className="bg-secondary border-border text-foreground min-h-[150px] text-base"
      />
      <Button onClick={send} disabled={submitting || !message.trim()} className="w-full font-display tracking-wider h-12">
        {submitting ? 'Sending...' : 'Send Message'}
      </Button>
    </div>
  );
};

// --- Tours (Enhanced: pickup time, notes, pending status) ---
const ToursView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: tours = [] } = useQuery({
    queryKey: ['tours-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('tours_config').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [selectedTour, setSelectedTour] = useState<any>(null);
  const [pax, setPax] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState('07:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const book = async () => {
    if (!selectedTour) return;
    setSubmitting(true);
    const totalPrice = selectedTour.price * (parseInt(pax) || 1);
    // Create pending booking — NO room charge yet
    await (supabase.from('tour_bookings') as any).insert({
      booking_id: session.booking_id,
      guest_name: session.guest_name,
      tour_name: selectedTour.name,
      tour_date: date,
      pax: parseInt(pax) || 1,
      price: totalPrice,
      room_id: session.room_id,
      status: 'pending',
      pickup_time: pickupTime,
      notes: notes.trim(),
    });
    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('tours,managers', `🚐 New Booking\n${session.guest_name}\n${selectedTour.name} - ${date} ${pickupTime}`);
    });
    qc.invalidateQueries({ queryKey: ['tour-bookings-admin'] });
    toast.success('Tour request submitted! Staff will confirm shortly.');
    setSelectedTour(null);
    setNotes('');
    setPickupTime('07:00');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Book a Tour</h2>
      <p className="font-body text-xs text-muted-foreground">Select a tour below. Staff will confirm your booking.</p>
      {tours.map((t: any) => (
        <div key={t.id} onClick={() => setSelectedTour(t)} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedTour?.id === t.id ? 'border-accent' : 'border-border hover:border-muted-foreground'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-body text-sm text-foreground font-medium">{t.name}</p>
              <p className="font-body text-xs text-muted-foreground">{t.description}</p>
              <p className="font-body text-xs text-muted-foreground">{t.duration} · {t.schedule} · Max {t.max_pax} pax</p>
            </div>
            <span className="font-body text-sm text-accent font-medium">₱{t.price}/pax</span>
          </div>
        </div>
      ))}
      {selectedTour && (
        <div className="bg-secondary p-4 rounded-lg space-y-3">
          <p className="font-body text-sm text-foreground font-medium">{selectedTour.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Pax</Label>
              <Input type="number" value={pax} onChange={e => setPax(e.target.value)} min="1" max={selectedTour.max_pax} className="bg-card text-foreground h-10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Pickup Time</Label>
            <Input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className="bg-card text-foreground h-10" />
          </div>
          <div className="space-y-1">
            <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" /> Special Requests</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Vegetarian lunch, need snorkel gear..." className="bg-card text-foreground min-h-[60px]" />
          </div>
          <p className="font-body text-sm text-foreground text-right">Total: ₱{selectedTour.price * (parseInt(pax) || 1)}</p>
          <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Tour Booking'}</Button>
          <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm and charge to your room</p>
        </div>
      )}
      {tours.length === 0 && <p className="font-body text-sm text-muted-foreground">No tours available at the moment.</p>}
    </div>
  );
};

// --- Transport (Now pending, no auto-charge) ---
const TransportView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: rates = [] } = useQuery({
    queryKey: ['transport-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('transport_rates').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState('08:00');
  const [submitting, setSubmitting] = useState(false);

  const book = async () => {
    if (!selectedRate) return;
    setSubmitting(true);
    const label = `${selectedRate.origin} → ${selectedRate.destination}`;
    // Create pending request — NO room charge yet
    const transportDetail = `${label} — ₱${selectedRate.price} — ${pickupDate} ${pickupTime}`;
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: 'Transport',
      details: transportDetail,
      status: 'pending',
    });
    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('tours,managers', `🚐 New Booking\n${session.guest_name}\nTransport: ${transportDetail}`);
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Transport request submitted! Staff will confirm shortly.');
    setSelectedRate(null);
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Request Transport</h2>
      <p className="font-body text-xs text-muted-foreground">Select a route. Staff will confirm and charge to your room.</p>
      {rates.map((r: any) => (
        <div key={r.id} onClick={() => setSelectedRate(r)} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedRate?.id === r.id ? 'border-accent' : 'border-border hover:border-muted-foreground'}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="font-body text-sm text-foreground">{r.origin} → {r.destination}</p>
              {r.description && <p className="font-body text-xs text-muted-foreground">{r.description}</p>}
            </div>
            <span className="font-body text-sm text-accent font-medium">₱{r.price}</span>
          </div>
        </div>
      ))}
      {selectedRate && (
        <div className="bg-secondary p-4 rounded-lg space-y-3">
          <p className="font-body text-sm text-foreground">{selectedRate.origin} → {selectedRate.destination}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Date</Label>
              <Input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
            <div className="space-y-1">
              <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Time</Label>
              <Input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} className="bg-card text-foreground h-10" />
            </div>
          </div>
          <p className="font-body text-sm text-foreground text-right">Total: ₱{selectedRate.price}</p>
          <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Transport'}</Button>
          <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm and charge to your room</p>
        </div>
      )}
      {rates.length === 0 && <p className="font-body text-sm text-muted-foreground">No transport options available.</p>}
    </div>
  );
};

// --- Rentals (Enhanced: duration selection, date, qty, notes, pending) ---
const RentalsView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: rates = [] } = useQuery({
    queryKey: ['rentals-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('rental_rates').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  // Group rates by item_type
  const itemTypes = [...new Set(rates.map((r: any) => r.item_type))];
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const typeRates = rates.filter((r: any) => r.item_type === selectedType);
  const totalPrice = selectedRate ? selectedRate.price * (parseInt(qty) || 1) : 0;

  const ITEM_ICONS: Record<string, string> = {
    'Scooter': '🛵',
    'Bicycle': '🚲',
    'Kayak': '🛶',
    'Surfboard': '🏄',
    'Snorkel': '🤿',
  };

  const book = async () => {
    if (!selectedRate) return;
    setSubmitting(true);
    const detail = `${selectedType} — ${selectedRate.rate_name} × ${qty} — ₱${totalPrice} — Start: ${startDate}${notes.trim() ? ` — Notes: ${notes.trim()}` : ''}`;
    // Create pending request — NO room charge yet
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: 'Rental',
      details: detail,
      status: 'pending',
    });
    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('tours,managers', `🚐 New Booking\n${session.guest_name}\nRental: ${detail}`);
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Rental request submitted! Staff will confirm shortly.');
    setSelectedType(null);
    setSelectedRate(null);
    setNotes('');
    setQty('1');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Rent Equipment</h2>
      <p className="font-body text-xs text-muted-foreground">Choose what you'd like to rent. Staff will confirm availability.</p>

      {!selectedType ? (
        <div className="grid grid-cols-2 gap-3">
          {itemTypes.map(type => (
            <button key={type} onClick={() => setSelectedType(type)} className="bg-card border border-border rounded-lg p-5 flex flex-col items-center gap-2 hover:border-accent transition-colors">
              <span className="text-3xl">{ITEM_ICONS[type] || '🏷️'}</span>
              <span className="font-body text-sm text-foreground font-medium">{type}</span>
              <span className="font-body text-xs text-muted-foreground">{rates.filter((r: any) => r.item_type === type).length} options</span>
            </button>
          ))}
          {itemTypes.length === 0 && <p className="font-body text-sm text-muted-foreground col-span-2">No rentals available.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={() => { setSelectedType(null); setSelectedRate(null); }} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-body text-xs">
            <ArrowLeft className="w-3 h-3" /> All equipment
          </button>

          <h3 className="font-body text-sm text-foreground font-medium">{ITEM_ICONS[selectedType] || '🏷️'} {selectedType} — Choose Duration</h3>

          <RadioGroup value={selectedRate?.id || ''} onValueChange={id => setSelectedRate(typeRates.find((r: any) => r.id === id))}>
            {typeRates.map((r: any) => (
              <div key={r.id} className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${selectedRate?.id === r.id ? 'border-accent' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={r.id} id={r.id} />
                  <Label htmlFor={r.id} className="flex-1 cursor-pointer">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-body text-sm text-foreground">{r.rate_name}</p>
                        {r.description && <p className="font-body text-xs text-muted-foreground">{r.description}</p>}
                      </div>
                      <span className="font-body text-sm text-accent font-medium">₱{r.price}</span>
                    </div>
                  </Label>
                </div>
              </div>
            ))}
          </RadioGroup>

          {selectedRate && (
            <div className="bg-secondary p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-card text-foreground h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs text-muted-foreground">Quantity</Label>
                  <Input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" max="5" className="bg-card text-foreground h-10" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="font-body text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" /> Preferences</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Automatic scooter preferred, need helmet..." className="bg-card text-foreground min-h-[60px]" />
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body text-xs text-muted-foreground">{selectedRate.rate_name} × {qty}</span>
                <span className="font-body text-sm text-foreground font-medium">Total: ₱{totalPrice}</span>
              </div>
              <Button onClick={book} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Request Rental'}</Button>
              <p className="font-body text-xs text-muted-foreground text-center">Staff will confirm availability and charge to your room</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Request/Note ---
const RequestView = ({ session, qc }: { session: GuestPortalSession; qc: any }) => {
  const { data: categories = [] } = useQuery({
    queryKey: ['request-cats-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('request_categories').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!type || !details.trim()) return;
    setSubmitting(true);
    await supabase.from('guest_requests').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      request_type: type,
      details: details.trim(),
      status: 'pending',
    });
    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('reception,managers', `🛎️ Guest Request\n${session.guest_name}\n${type}: ${details.trim()}`);
    });
    qc.invalidateQueries({ queryKey: ['guest-requests-admin'] });
    toast.success('Request submitted!');
    setDetails('');
    setType('');
    setSubmitting(false);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-foreground">Leave a Note / Request</h2>
      <Select onValueChange={setType} value={type}>
        <SelectTrigger className="bg-secondary border-border text-foreground h-12">
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {categories.map((c: any) => <SelectItem key={c.id} value={c.name} className="text-foreground">{c.icon} {c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Describe your request..." className="bg-secondary border-border text-foreground min-h-[120px]" />
      <Button onClick={submit} disabled={submitting || !type || !details.trim()} className="w-full">{submitting ? 'Submitting...' : 'Submit Request'}</Button>
    </div>
  );
};

// --- Review ---
const ReviewView = ({ session, qc, onDone }: { session: GuestPortalSession; qc: any; onDone: () => void }) => {
  const { data: categories = [] } = useQuery({
    queryKey: ['review-cats-guest'],
    queryFn: async () => {
      const { data } = await supabase.from('review_settings').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await supabase.from('guest_reviews').insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      guest_name: session.guest_name,
      ratings,
      comments: comments.trim(),
    });
    qc.invalidateQueries({ queryKey: ['guest-reviews-admin'] });
    toast.success('Thank you for your review!');
    setSubmitting(false);
    onDone();
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">Write a Review</h2>
      {categories.map((c: any) => {
        const selected = ratings[c.category_name] || 0;
        return (
          <div key={c.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-body text-sm text-foreground">{c.category_name}</p>
              {selected > 0 && (
                <span className="font-display text-sm text-accent">{selected}/10</span>
              )}
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <button
                  key={num}
                  onClick={() => setRatings(r => ({ ...r, [c.category_name]: num }))}
                  className={`flex-1 h-9 rounded text-xs font-display tracking-wider border transition-colors ${
                    selected === num
                      ? 'bg-accent text-accent-foreground border-accent'
                      : selected >= num
                        ? 'bg-accent/20 text-accent border-accent/40'
                        : 'bg-secondary text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <Textarea value={comments} onChange={e => setComments(e.target.value)} placeholder="Any additional comments..." className="bg-secondary border-border text-foreground min-h-[100px]" />
      <Button onClick={submit} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Submit Review'}</Button>
    </div>
  );
};

// --- Orders ---
const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  'New': { label: 'Received', color: 'bg-blue-500/20 text-blue-400' },
  'Preparing': { label: 'Preparing', color: 'bg-amber-500/20 text-amber-400' },
  'Ready': { label: 'Ready', color: 'bg-emerald-500/20 text-emerald-400' },
  'Served': { label: 'Served', color: 'bg-green-500/20 text-green-400' },
  'Paid': { label: 'Complete', color: 'bg-muted text-muted-foreground' },
  'Closed': { label: 'Closed', color: 'bg-muted text-muted-foreground' },
  'Cancelled': { label: 'Cancelled', color: 'bg-destructive/20 text-destructive' },
};

const DEPT_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  preparing: 'Preparing',
  ready: 'Ready',
};

const OrdersView = ({ session }: { session: GuestPortalSession }) => {
  const qc = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ['guest-orders', session.room_id, session.room_name],
    queryFn: async () => {
      // Primary: orders linked by room_id
      const { data: byRoom } = await supabase
        .from('orders')
        .select('*')
        .eq('room_id', session.room_id)
        .order('created_at', { ascending: false });
      // Fallback: orders where room_id is null but location_detail matches room name
      const { data: byLocation } = await supabase
        .from('orders')
        .select('*')
        .is('room_id', null)
        .eq('location_detail', session.room_name)
        .order('created_at', { ascending: false });
      // Merge and deduplicate
      const map = new Map<string, any>();
      for (const o of [...(byRoom || []), ...(byLocation || [])]) map.set(o.id, o);
      return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('guest-order-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `room_id=eq.${session.room_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-orders', session.room_id, session.room_name] });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
      }, (payload: any) => {
        // Also catch orders matching by location_detail (no room_id set)
        if (payload.new?.location_detail === session.room_name && !payload.new?.room_id) {
          qc.invalidateQueries({ queryKey: ['guest-orders', session.room_id, session.room_name] });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.room_id, session.room_name, qc]);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">My Orders</h2>
      {orders.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground text-center py-8">No orders during your stay.</p>
      ) : (
        orders.map((order: any) => {
          const statusInfo = ORDER_STATUS_MAP[order.status] || { label: order.status, color: 'bg-muted text-muted-foreground' };
          const items = Array.isArray(order.items) ? order.items : [];
          const hasKitchenItems = items.some((i: any) => (i.department || 'kitchen') === 'kitchen' || (i.department || 'kitchen') === 'both');
          const hasBarItems = items.some((i: any) => i.department === 'bar' || i.department === 'both');
          const timeStr = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = new Date(order.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
          return (
            <div key={order.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-start">
                <span className="font-body text-xs text-muted-foreground">
                  {dateStr} · {timeStr}
                </span>
                <div className="flex flex-wrap gap-1 justify-end">
                  <span className={`font-body text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
              {/* Department-level status badges */}
              {(order.status === 'New' || order.status === 'Preparing' || order.status === 'Ready') && (
                <div className="flex flex-wrap gap-1.5">
                  {hasKitchenItems && (
                    <span className={`font-body text-[11px] px-2 py-0.5 rounded-full border ${
                      order.kitchen_status === 'ready' ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                      order.kitchen_status === 'preparing' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                      'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    }`}>
                      🍳 {DEPT_STATUS_LABELS[order.kitchen_status] || 'Waiting'}
                    </span>
                  )}
                  {hasBarItems && (
                    <span className={`font-body text-[11px] px-2 py-0.5 rounded-full border ${
                      order.bar_status === 'ready' ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                      order.bar_status === 'preparing' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                      'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    }`}>
                      🍹 {DEPT_STATUS_LABELS[order.bar_status] || 'Waiting'}
                    </span>
                  )}
                </div>
              )}
              {/* Per-item list with individual status */}
              <div className="space-y-1.5">
                {items.map((item: any, idx: number) => {
                  const dept = item.department || 'kitchen';
                  const itemStatus = dept === 'bar' || dept === 'both' 
                    ? (order.bar_status === 'ready' ? 'Ready' : order.bar_status === 'preparing' ? 'Preparing' : order.status)
                    : (order.kitchen_status === 'ready' ? 'Ready' : order.kitchen_status === 'preparing' ? 'Preparing' : order.status);
                  const finalStatus = order.status === 'Served' ? 'Served' : order.status === 'Paid' ? 'Paid' : order.status === 'Ready' ? 'Ready' : itemStatus;
                  return (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="font-body text-sm text-foreground">{item.qty || item.quantity || 1}× {item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-body text-xs text-muted-foreground">₱{((item.price || 0) * (item.qty || item.quantity || 1)).toLocaleString()}</span>
                        <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ${
                          finalStatus === 'Served' || finalStatus === 'Ready' ? 'text-green-400' :
                          finalStatus === 'Preparing' ? 'text-amber-400' :
                          finalStatus === 'Paid' ? 'text-muted-foreground' : 'text-blue-400'
                        }`}>
                          {finalStatus}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-body text-sm text-foreground font-medium">Total</span>
                <span className="font-body text-sm text-foreground font-medium">₱{(order.total || 0).toLocaleString()}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// --- Requests Tracker (Tours, Transport, Rentals) ---
const REQUEST_STATUS_MAP: Record<string, { label: string; color: string }> = {
  'pending': { label: 'Pending', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'booked': { label: 'Pending', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'confirmed': { label: 'Confirmed', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  'cancelled': { label: 'Cancelled', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  'completed': { label: 'Completed', color: 'bg-muted text-muted-foreground border-border' },
};

const RequestsTrackerView = ({ session }: { session: GuestPortalSession }) => {
  const qc = useQueryClient();

  const { data: tours = [] } = useQuery({
    queryKey: ['guest-my-tours', session.booking_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('guest_tours')
        .select('*')
        .eq('booking_id', session.booking_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['guest-my-requests', session.booking_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('guest_requests')
        .select('*')
        .eq('booking_id', session.booking_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('guest-requests-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'guest_tours',
        filter: `booking_id=eq.${session.booking_id}`,
      }, () => { qc.invalidateQueries({ queryKey: ['guest-my-tours', session.booking_id] }); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'guest_requests',
        filter: `booking_id=eq.${session.booking_id}`,
      }, () => { qc.invalidateQueries({ queryKey: ['guest-my-requests', session.booking_id] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.booking_id, qc]);

  const hasAny = tours.length > 0 || requests.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">My Requests</h2>
      {!hasAny ? (
        <p className="font-body text-sm text-muted-foreground text-center py-8">No requests submitted yet.</p>
      ) : (
        <>
          {tours.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-body text-xs text-muted-foreground uppercase tracking-wider">Tours</h3>
              {tours.map((t: any) => {
                const st = REQUEST_STATUS_MAP[t.status] || REQUEST_STATUS_MAP['pending'];
                return (
                  <div key={t.id} className="bg-card border border-border rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <span className="font-body text-sm text-foreground font-medium">🗺️ {t.tour_name}</span>
                      <span className={`font-body text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex gap-3 font-body text-xs text-muted-foreground">
                      <span>{t.tour_date}</span>
                      <span>{t.pax} pax</span>
                      <span>Pickup: {t.pickup_time}</span>
                    </div>
                    {t.price > 0 && <p className="font-body text-xs text-accent">₱{t.price.toLocaleString()}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {requests.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-body text-xs text-muted-foreground uppercase tracking-wider">Transport & Rentals</h3>
              {requests.map((r: any) => {
                const st = REQUEST_STATUS_MAP[r.status] || REQUEST_STATUS_MAP['pending'];
                const icon = r.request_type === 'Transport' ? '🚗' : r.request_type === 'Rental' ? '🛵' : '📋';
                return (
                  <div key={r.id} className="bg-card border border-border rounded-lg p-3 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <span className="font-body text-sm text-foreground font-medium">{icon} {r.request_type}</span>
                      <span className={`font-body text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                    </div>
                    <p className="font-body text-xs text-muted-foreground">{r.details}</p>
                    <p className="font-body text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- Bill ---
const getBillIcon = (notes: string | null, txType: string) => {
  const n = (notes || '').toLowerCase();
  if (txType === 'payment') return <CreditCard className="w-4 h-4 text-green-400" />;
  if (n.includes('food') || n.includes('order') || n.includes('kitchen') || n.includes('bar')) return <Utensils className="w-4 h-4 text-amber-400" />;
  if (n.includes('tour') || n.includes('island')) return <Palmtree className="w-4 h-4 text-emerald-400" />;
  if (n.includes('transport') || n.includes('van') || n.includes('transfer')) return <Truck className="w-4 h-4 text-blue-400" />;
  if (n.includes('scooter') || n.includes('bike') || n.includes('rental')) return <Bike className="w-4 h-4 text-purple-400" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
};

const BillView = ({ session }: { session: GuestPortalSession }) => {
  const qc = useQueryClient();
  const [agreeing, setAgreeing] = useState(false);
  const [contestOpen, setContestOpen] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Check if guest already agreed
  const { data: bookingData, refetch: refetchBooking } = useQuery({
    queryKey: ['guest-bill-agreement', session.booking_id],
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('bill_agreed_at, room_rate, check_in, check_out, platform, paid_amount').eq('id', session.booking_id).maybeSingle();
      return data as any;
    },
  });
  const billAgreedAt = bookingData?.bill_agreed_at;
  const bookingRoomRate = bookingData?.room_rate || 0;
  const bookingCheckIn = bookingData?.check_in;
  const bookingCheckOut = bookingData?.check_out;
  const bookingNights = bookingCheckIn && bookingCheckOut
    ? Math.max(1, Math.round((new Date(bookingCheckOut).getTime() - new Date(bookingCheckIn).getTime()) / 86400000))
    : 0;

  const handleAgree = async () => {
    setAgreeing(true);
    await (supabase.from('resort_ops_bookings') as any).update({ bill_agreed_at: new Date().toISOString() }).eq('id', session.booking_id);
    await refetchBooking();
    setAgreeing(false);
    toast.success('Bill agreed! Reception has been notified.');
  };

  const { data: transactions = [] } = useQuery({
    queryKey: ['guest-bill', session.booking_id, session.room_id],
    queryFn: async () => {
      // Fetch by booking_id OR by unit_id (for transactions missing booking_id)
      const { data: byBooking } = await (supabase.from('room_transactions') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .order('created_at', { ascending: false });
      const { data: byUnit } = await (supabase.from('room_transactions') as any)
        .select('*')
        .eq('unit_id', session.room_id)
        .is('booking_id', null)
        .order('created_at', { ascending: false });
      const all = [...(byBooking || []), ...(byUnit || [])];
      // Deduplicate by id
      const seen = new Set<string>();
      return all.filter((t: any) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    },
  });

  // Unpaid F&B orders (not charged to room — active orders awaiting payment)
  const { data: unpaidOrders = [] } = useQuery({
    queryKey: ['guest-bill-unpaid-orders', session.room_id, session.room_name],
    queryFn: async () => {
      const { data: byRoom } = await supabase
        .from('orders')
        .select('id, total, service_charge, guest_name, status, payment_type, created_at, items')
        .eq('room_id', session.room_id)
        .in('status', ['New', 'Preparing', 'Ready', 'Served'])
        .is('payment_type', null);
      const { data: byLocation } = await supabase
        .from('orders')
        .select('id, total, service_charge, guest_name, status, payment_type, created_at, items')
        .is('room_id', null)
        .eq('location_detail', session.room_name)
        .in('status', ['New', 'Preparing', 'Ready', 'Served'])
        .is('payment_type', null);
      const map = new Map<string, any>();
      for (const o of [...(byRoom || []), ...(byLocation || [])]) map.set(o.id, o);
      return Array.from(map.values());
    },
  });

  // Room-charged F&B orders (charged to folio, tracked via room_transactions)
  const { data: roomChargedOrders = [] } = useQuery({
    queryKey: ['guest-bill-room-charged-orders', session.room_id, session.room_name],
    queryFn: async () => {
      const { data: byRoom } = await supabase
        .from('orders')
        .select('id, total, service_charge, guest_name, status, payment_type, created_at, items')
        .eq('room_id', session.room_id)
        .eq('payment_type', 'Charge to Room')
        .in('status', ['Served']);
      const { data: byLocation } = await supabase
        .from('orders')
        .select('id, total, service_charge, guest_name, status, payment_type, created_at, items')
        .is('room_id', null)
        .eq('location_detail', session.room_name)
        .eq('payment_type', 'Charge to Room')
        .in('status', ['Served']);
      const map = new Map<string, any>();
      for (const o of [...(byRoom || []), ...(byLocation || [])]) map.set(o.id, o);
      return Array.from(map.values());
    },
  });

  // Pending tours (includes confirmed — show immediately on bill)
  const { data: pendingTours = [] } = useQuery({
    queryKey: ['guest-bill-pending-tours', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('tour_bookings') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .in('status', ['booked', 'pending', 'confirmed']);
      return data || [];
    },
  });

  // Completed tours
  const { data: completedTours = [] } = useQuery({
    queryKey: ['guest-bill-completed-tours', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('tour_bookings') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .in('status', ['completed']);
      return data || [];
    },
  });

  // Pending requests (transport, rentals)
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['guest-bill-pending-requests', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('guest_requests') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .eq('status', 'pending');
      return data || [];
    },
  });

  // Completed requests
  const { data: completedRequests = [] } = useQuery({
    queryKey: ['guest-bill-completed-requests', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('guest_requests') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .eq('status', 'completed');
      return data || [];
    },
  });

  // Bill disputes
  const { data: disputes = [] } = useQuery({
    queryKey: ['guest-bill-disputes', session.booking_id],
    queryFn: async () => {
      const { data } = await (supabase.from('bill_disputes') as any)
        .select('*')
        .eq('booking_id', session.booking_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const handleContestSubmit = async () => {
    if (!disputeMessage.trim()) return;
    setSubmittingDispute(true);
    await (supabase.from('bill_disputes') as any).insert({
      booking_id: session.booking_id,
      room_id: session.room_id,
      unit_name: session.room_name,
      guest_name: session.guest_name,
      guest_message: disputeMessage.trim(),
    });
    qc.invalidateQueries({ queryKey: ['guest-bill-disputes', session.booking_id] });
    setSubmittingDispute(false);
    setContestOpen(false);
    setDisputeMessage('');
    toast.success('Dispute submitted — reception has been notified.');
  };

  // Realtime subscription — broadened to catch all DELETE events
  useEffect(() => {
    const channel = supabase
      .channel('guest-bill-realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_transactions',
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-bill', session.booking_id, session.room_id] });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-bill-unpaid-orders', session.room_id, session.room_name] });
        qc.invalidateQueries({ queryKey: ['guest-bill-room-charged-orders', session.room_id, session.room_name] });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tour_bookings',
        filter: `booking_id=eq.${session.booking_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-bill-pending-tours', session.booking_id] });
        qc.invalidateQueries({ queryKey: ['guest-bill-completed-tours', session.booking_id] });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'guest_requests',
        filter: `booking_id=eq.${session.booking_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-bill-pending-requests', session.booking_id] });
        qc.invalidateQueries({ queryKey: ['guest-bill-completed-requests', session.booking_id] });
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bill_disputes',
        filter: `booking_id=eq.${session.booking_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['guest-bill-disputes', session.booking_id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.booking_id, session.room_id, qc]);

  const otaPlatforms = ['booking.com', 'airbnb', 'agoda', 'expedia', 'hostelworld', 'trip.com'];
  const guestIsOta = bookingData?.platform && otaPlatforms.includes(bookingData.platform.toLowerCase());
  // Filter out accommodation rows for OTA stays
  const visibleTransactions = guestIsOta ? transactions.filter((t: any) => t.transaction_type !== 'accommodation') : transactions;
  const charges = visibleTransactions.filter((t: any) => (t.total_amount || 0) > 0);
  const payments = visibleTransactions.filter((t: any) => (t.total_amount || 0) < 0);
  const totalCharges = charges.reduce((s: number, t: any) => s + (t.total_amount || 0), 0);
  const totalPayments = Math.abs(payments.reduce((s: number, t: any) => s + (t.total_amount || 0), 0));
  const unpaidOrdersTotal = unpaidOrders.reduce((s: number, o: any) => s + (o.total || 0) + (o.service_charge || 0), 0);
  const unpaidOrdersSCTotal = unpaidOrders.reduce((s: number, o: any) => s + (o.service_charge || 0), 0);
  const unpaidOrdersSubtotal = unpaidOrdersTotal - unpaidOrdersSCTotal;
  // Completed tours/requests are now charged to the room ledger, so only count pending ones here
  const activeToursTotal = pendingTours.reduce((s: number, t: any) => s + Number(t.price || 0), 0);
  const activeRequestsTotal = pendingRequests.reduce((s: number, r: any) => s + Number(r.price || 0), 0);
  const balance = totalCharges - totalPayments + unpaidOrdersTotal + activeToursTotal + activeRequestsTotal;
  const hasPending = pendingTours.length > 0 || pendingRequests.length > 0;

  // Separate room charges for clear display (accommodation already filtered for OTA)
  const roomCharges = charges.filter((t: any) => ['accommodation', 'room_charge', 'adjustment', 'charge'].includes(t.transaction_type));

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-foreground">My Bill</h2>

      {/* Stay Details — hide for OTA stays since accommodation is prepaid */}
      {bookingRoomRate > 0 && !guestIsOta && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-1">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Stay Details</p>
          <div className="flex justify-between">
            <span className="font-body text-sm text-muted-foreground">Room Rate</span>
            <span className="font-body text-sm text-foreground">₱{bookingRoomRate.toLocaleString()}/night</span>
          </div>
          <div className="flex justify-between">
            <span className="font-body text-sm text-muted-foreground">Duration</span>
            <span className="font-body text-sm text-foreground">{bookingNights} night{bookingNights !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1">
            <span className="font-body text-sm text-muted-foreground font-medium">Room Total</span>
            <span className="font-body text-sm text-foreground font-medium">₱{(bookingRoomRate * bookingNights).toLocaleString()}</span>
          </div>
        </div>
      )}
      {guestIsOta && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <p className="font-body text-sm text-emerald-400">✓ Accommodation paid via {bookingData.platform}</p>
          <p className="font-body text-xs text-muted-foreground">Only incidentals (food, tours, etc.) appear on your bill below.</p>
        </div>
      )}

      {/* Balance summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex justify-between mb-2">
          <span className="font-body text-sm text-muted-foreground">Total Charges</span>
          <span className="font-body text-sm text-foreground">₱{totalCharges.toLocaleString()}</span>
        </div>
        {unpaidOrdersTotal > 0 && (
          <>
            <div className="flex justify-between mb-1">
              <span className="font-body text-sm text-muted-foreground">F&B Subtotal</span>
              <span className="font-body text-sm text-amber-400">₱{unpaidOrdersSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="font-body text-sm text-muted-foreground">Service Charge (10%)</span>
              <span className="font-body text-sm text-amber-400">₱{unpaidOrdersSCTotal.toLocaleString()}</span>
            </div>
          </>
        )}
        {activeToursTotal > 0 && (
          <div className="flex justify-between mb-2">
            <span className="font-body text-sm text-muted-foreground">Tours & Experiences</span>
            <span className="font-body text-sm text-foreground">₱{activeToursTotal.toLocaleString()}</span>
          </div>
        )}
        {activeRequestsTotal > 0 && (
          <div className="flex justify-between mb-2">
            <span className="font-body text-sm text-muted-foreground">Transport & Rentals</span>
            <span className="font-body text-sm text-foreground">₱{activeRequestsTotal.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between mb-2">
          <span className="font-body text-sm text-muted-foreground">Total Payments</span>
          <span className="font-body text-sm text-green-400">₱{totalPayments.toLocaleString()}</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-body text-sm text-foreground font-medium">Balance</span>
          <span className={`font-body text-sm font-medium ${balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>₱{balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Active F&B orders with itemized breakdown and status */}
      {unpaidOrders.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-amber-400 uppercase flex items-center gap-1">
            ⚠️ Active Orders
          </p>
          {unpaidOrders.map((o: any) => {
            const items = Array.isArray(o.items) ? o.items : [];
            const statusColor = o.status === 'New' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              : o.status === 'Preparing' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              : o.status === 'Ready' ? 'bg-green-500/20 text-green-300 border-green-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
            const statusDesc = o.status === 'New' ? 'Order received'
              : o.status === 'Preparing' ? 'Being prepared by kitchen'
              : o.status === 'Ready' ? 'Ready for pickup'
              : 'Served ✓';
            const orderTotal = Number(o.total || 0) + Number(o.service_charge || 0);
            return (
              <div key={o.id} className="bg-card border border-border p-3 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-amber-400" />
                    <span className="font-body text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{o.status}</Badge>
                  </div>
                </div>
                <p className="font-body text-[11px] text-muted-foreground pl-6">{statusDesc}</p>
                {/* Itemized contents */}
                <div className="space-y-0.5 pl-6">
                  {items.map((i: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="font-body text-sm text-foreground">{i.qty || 1}× {i.name}</span>
                      <span className="font-body text-xs text-muted-foreground">₱{((i.price || 0) * (i.qty || 1)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                {/* SC breakdown */}
                <div className="pl-6 border-t border-border/50 pt-1 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-body text-[11px] text-muted-foreground">Subtotal</span>
                    <span className="font-body text-[11px] text-muted-foreground">₱{Number(o.total || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-body text-[11px] text-muted-foreground">Service Charge (10%)</span>
                    <span className="font-body text-[11px] text-muted-foreground">₱{Number(o.service_charge || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-foreground font-medium">Total</span>
                    <span className="font-body text-xs text-amber-400 font-medium">₱{orderTotal.toLocaleString()}</span>
                  </div>
                </div>
                {o.status === 'Served' && (
                  <div className="pl-6">
                    <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">Pay at Counter</Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Room-Charged F&B Orders */}
      {roomChargedOrders.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-blue-400 uppercase flex items-center gap-1">
            🏠 Room Charges
          </p>
          {roomChargedOrders.map((o: any) => {
            const items = Array.isArray(o.items) ? o.items : [];
            const orderTotal = Number(o.total || 0) + Number(o.service_charge || 0);
            return (
              <div key={o.id} className="bg-card border border-blue-500/20 p-3 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-blue-400" />
                    <span className="font-body text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">Room Charge</Badge>
                </div>
                <div className="space-y-0.5 pl-6">
                  {items.map((i: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="font-body text-sm text-foreground">{i.qty || 1}× {i.name}</span>
                      <span className="font-body text-xs text-muted-foreground">₱{((i.price || 0) * (i.qty || 1)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="pl-6 border-t border-border/50 pt-1">
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-foreground font-medium">Total</span>
                    <span className="font-body text-xs text-blue-400 font-medium">₱{orderTotal.toLocaleString()}</span>
                  </div>
                </div>
                <div className="pl-6">
                  <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-400">Charged to Room</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasPending && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Pending Confirmation
          </p>
          {pendingTours.map((t: any) => (
            <div key={t.id} className="bg-secondary/50 border border-dashed border-border p-3 rounded flex justify-between items-start opacity-70">
              <div className="flex items-start gap-2">
                <Palmtree className="w-4 h-4 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-body text-sm text-foreground">{t.tour_name}</p>
                  <p className="font-body text-xs text-muted-foreground">{t.tour_date} · {t.pax} pax{t.pickup_time ? ` · Pickup ${t.pickup_time}` : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-body text-sm text-muted-foreground">₱{(t.price || 0).toLocaleString()}</span>
                <Badge variant="outline" className="ml-2 text-[10px]">Pending</Badge>
              </div>
            </div>
          ))}
          {pendingRequests.map((r: any) => (
            <div key={r.id} className="bg-secondary/50 border border-dashed border-border p-3 rounded flex justify-between items-start opacity-70">
              <div className="flex items-start gap-2">
                {r.request_type?.toLowerCase().includes('transport') ? <Truck className="w-4 h-4 text-blue-400 mt-0.5" /> : <Bike className="w-4 h-4 text-purple-400 mt-0.5" />}
                <div>
                  <p className="font-body text-sm text-foreground">{r.request_type}</p>
                  <p className="font-body text-xs text-muted-foreground">{r.details}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">Pending</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Completed Tours & Experiences */}
      {(completedTours.length > 0 || completedRequests.length > 0) && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-emerald-400 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed Experiences
          </p>
          {completedTours.map((t: any) => (
            <div key={t.id} className="bg-card border border-emerald-500/20 p-3 rounded-lg flex justify-between items-start">
              <div className="flex items-start gap-2">
                <Palmtree className="w-4 h-4 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-body text-sm text-foreground">{t.tour_name}</p>
                  <p className="font-body text-xs text-muted-foreground">{t.tour_date} · {t.pax} pax{t.pickup_time ? ` · Pickup ${t.pickup_time}` : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="font-body text-sm text-foreground">₱{(t.price || 0).toLocaleString()}</span>
                <Badge variant="outline" className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Charged to Room</Badge>
              </div>
            </div>
          ))}
          {completedRequests.map((r: any) => (
            <div key={r.id} className="bg-card border border-emerald-500/20 p-3 rounded-lg flex justify-between items-start">
              <div className="flex items-start gap-2">
                {r.request_type?.toLowerCase().includes('transport') ? <Truck className="w-4 h-4 text-blue-400 mt-0.5" /> : <Bike className="w-4 h-4 text-purple-400 mt-0.5" />}
                <div>
                  <p className="font-body text-sm text-foreground">{r.request_type}</p>
                  <p className="font-body text-xs text-muted-foreground">{r.details}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Charged to Room</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Room Charges — accommodation, adjustments, etc. */}
      {roomCharges.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase flex items-center gap-1">
            🏠 Room Charges
          </p>
          {roomCharges.map((t: any) => (
            <div key={t.id} className="bg-primary/5 border border-primary/20 p-3 rounded-lg flex justify-between items-start">
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <p className="font-body text-sm text-foreground">
                    {t.notes || t.transaction_type.replace(/_/g, ' ')}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {t.staff_name ? ` · ${t.staff_name}` : ''}
                  </p>
                </div>
              </div>
              <span className="font-body text-sm font-medium text-foreground">+₱{Math.abs(t.total_amount || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payments & other transactions */}
      <div className="space-y-2">
        {payments.length > 0 && (
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Payments</p>
        )}
        {payments.map((t: any) => (
          <div key={t.id} className="bg-secondary p-3 rounded-lg flex justify-between items-start">
            <div className="flex items-start gap-2">
              {getBillIcon(t.notes, t.transaction_type)}
              <div>
                <p className="font-body text-sm text-foreground">
                  {t.payment_method}{t.notes ? ` — ${t.notes}` : ''}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {t.staff_name ? ` · ${t.staff_name}` : ''}
                </p>
              </div>
            </div>
            <span className="font-body text-sm font-medium text-green-400">-₱{Math.abs(t.total_amount || 0).toLocaleString()}</span>
          </div>
        ))}
        {transactions.length === 0 && !hasPending && unpaidOrders.length === 0 && <p className="font-body text-sm text-muted-foreground text-center">No transactions yet.</p>}
      </div>

      {/* Disputes */}
      {disputes.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-xs tracking-wider text-amber-400 uppercase flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Bill Disputes
          </p>
          {disputes.map((d: any) => (
            <div key={d.id} className={`border rounded-lg p-3 space-y-2 ${d.status === 'open' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={`text-[10px] ${d.status === 'open' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                  {d.status === 'open' ? 'Under Review' : d.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                </Badge>
                <span className="font-body text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <p className="font-body text-sm text-foreground">{d.guest_message}</p>
              {d.staff_response && (
                <div className="bg-secondary rounded p-2 space-y-1">
                  <p className="font-body text-[10px] text-muted-foreground">Response from {d.responded_by}:</p>
                  <p className="font-body text-sm text-foreground">{d.staff_response}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bill Agreement */}
      {(transactions.length > 0 || unpaidOrders.length > 0) && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          {billAgreedAt ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <div>
                <p className="font-display text-sm">Bill Reviewed & Agreed</p>
                <p className="font-body text-xs text-muted-foreground">{new Date(billAgreedAt).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <>
              {disputes.some((d: any) => d.status === 'open') ? (
                <p className="font-body text-xs text-amber-400">Your dispute is under review. You can agree once it's resolved.</p>
              ) : (
                <>
                  <p className="font-body text-xs text-muted-foreground">By tapping below, you confirm that you have reviewed all charges and agree to this bill.</p>
                  <Button onClick={handleAgree} disabled={agreeing} className="w-full font-display tracking-wider h-12">
                    {agreeing ? 'Submitting...' : '✓ I Agree to This Bill'}
                  </Button>
                </>
              )}
              {!disputes.some((d: any) => d.status === 'open') && (
                <Button variant="outline" onClick={() => setContestOpen(true)} className="w-full font-display tracking-wider h-12 border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  ⚠️ Contest This Bill
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Contest Modal */}
      {contestOpen && (
        <div className="border border-amber-500/40 rounded-lg p-4 space-y-3 bg-amber-500/5">
          <p className="font-display text-sm text-foreground">Contest This Bill</p>
          <p className="font-body text-xs text-muted-foreground">Describe which charges are incorrect and why. Reception will review and respond.</p>
          <Textarea
            value={disputeMessage}
            onChange={e => setDisputeMessage(e.target.value)}
            placeholder="e.g. I was charged for Pancakes but never received them..."
            className="bg-secondary border-border text-foreground min-h-[100px] text-base"
          />
          <div className="flex gap-2">
            <Button onClick={handleContestSubmit} disabled={submittingDispute || !disputeMessage.trim()} className="flex-1 font-display tracking-wider h-10">
              {submittingDispute ? 'Submitting...' : 'Submit Dispute'}
            </Button>
            <Button variant="outline" onClick={() => { setContestOpen(false); setDisputeMessage(''); }} className="font-display tracking-wider h-10">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
export default GuestPortal;
