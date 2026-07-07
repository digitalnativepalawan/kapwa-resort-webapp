import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/lib/cart';
import { useResortProfile } from '@/hooks/useResortProfile';
import { getMenuItemStockStatus } from '@/lib/stockCheck';
import { getGuestSession, clearGuestSession } from '@/hooks/useGuestSession';
import { ShoppingBag, Plus, Minus, UtensilsCrossed, ClipboardList, Search, X, Home, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CartDrawer from '@/components/CartDrawer';
import StaffOrdersView from '@/components/staff/StaffOrdersView';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  available: boolean;
  sort_order: number;
}

const MenuPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') || 'guest';
  const orderType = searchParams.get('orderType') || '';
  const location = searchParams.get('location') || '';
  const initialGuestName = searchParams.get('guestName') || '';
  const isStaff = mode === 'staff';
  const isGuestOrder = mode === 'guest-order';
  const isBrowseOnly = mode === 'guest';
  const guestSession = isGuestOrder ? getGuestSession() : null;

  // Redirect if guest session expired
  useEffect(() => {
    if (isGuestOrder && !guestSession) {
      navigate('/');
    }
  }, [isGuestOrder, guestSession, navigate]);

  const { data: profile } = useResortProfile();
  const brandName = profile?.resort_name || 'Menu';

  const [activeCategory, setActiveCategory] = useState('');
  const [staffTab, setStaffTab] = useState<'menu' | 'orders'>('menu');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_categories').select('*').eq('active', true).order('sort_order');
      return data || [];
    },
  });

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);

  const cart = useCart();

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu_items'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('available', true).order('sort_order');
      return (data || []) as MenuItem[];
    },
  });

  // Stock status for sold-out/low-stock badges
  const { data: stockStatus = {} } = useQuery({
    queryKey: ['menu-stock-status'],
    queryFn: getMenuItemStockStatus,
    refetchInterval: 30000,
  });

  // Derive categories from items as fallback when menu_categories is empty
  const derivedCategories = categories.length > 0
    ? categories
    : [...new Set(menuItems.map(i => i.category))].map((name, idx) => ({ id: name, name, sort_order: idx }));

  useEffect(() => {
    if (derivedCategories.length > 0 && !activeCategory) {
      setActiveCategory(derivedCategories[0].name);
    }
  }, [derivedCategories, activeCategory]);

  // Count active orders for badge (staff only)
  const { data: activeOrderCount = 0 } = useQuery({
    queryKey: ['active-order-count-staff'],
    enabled: isStaff,
    refetchInterval: 10000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', start.toISOString())
        .in('status', ['New', 'Preparing', 'Served', 'Paid']);
      return count || 0;
    },
  });

  // Filter items by category or search
  const filteredItems = searchQuery.trim()
    ? menuItems.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.description && i.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : menuItems.filter(i => i.category === activeCategory);

  // Fetch menu items with department info for cart
  const { data: menuItemsFull = [] } = useQuery({
    queryKey: ['menu_items_full'],
    queryFn: async () => {
      const { data } = await supabase.from('menu_items').select('id, department').order('id');
      return data || [];
    },
  });

  const handleAddToCart = () => {
    if (!selectedItem) return;
    const fullItem = menuItemsFull.find((m: any) => m.id === selectedItem.id);
    const department = (fullItem as any)?.department || 'kitchen';
    for (let i = 0; i < addQuantity; i++) {
      cart.addItem({ id: selectedItem.id, name: selectedItem.name, price: selectedItem.price, department });
    }
    setSelectedItem(null);
    setAddQuantity(1);
  };

  const showMenu = !isStaff || staffTab === 'menu';

  return (
    <div className={`min-h-screen bg-navy-texture flex flex-col overflow-x-hidden ${isStaff ? 'pb-16' : ''}`}>
      {showMenu ? (
        <>
          {/* Header */}
          <header className="sticky top-0 z-30 bg-navy-deep/95 backdrop-blur-sm border-b border-border">
            {/* Guest order banner */}
            {isGuestOrder && guestSession && (
              <div className="bg-gold/10 border-b border-gold/20 px-4 py-2 flex items-center justify-between max-w-2xl mx-auto">
                <p className="font-body text-xs text-gold">
                  🏠 Room {guestSession.room_name} — {guestSession.guest_name}
                </p>
                <button
                  onClick={() => { clearGuestSession(); navigate('/'); }}
                  className="flex items-center gap-1 text-cream-dim hover:text-foreground text-xs font-body transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Exit
                </button>
              </div>
            )}
            <div className="max-w-2xl mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
              <button
                onClick={() => {
                  if (isGuestOrder) { clearGuestSession(); }
                  navigate('/');
                }}
                className="text-cream-dim hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <Home className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <h1 className="font-display text-base tracking-[0.12em] text-foreground">{brandName}</h1>
              </div>

              <button
                onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-cream-dim hover:text-foreground transition-colors"
              >
                {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </button>
            </div>

            {/* Search bar */}
            {searchOpen && (
              <div className="max-w-2xl mx-auto px-4 pb-3">
                <Input
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  className="bg-secondary border-border text-foreground font-body h-10"
                />
              </div>
            )}

            {/* Category tabs - hidden during search */}
            {!searchOpen && (
              <div className="max-w-2xl mx-auto">
              <div className="px-4 pb-3 flex flex-wrap gap-1">
                  {derivedCategories.map((cat: any) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`font-display text-xs tracking-wider px-3 py-2 rounded-full transition-colors min-h-[36px] ${
                        activeCategory === cat.name
                          ? 'bg-gold/20 text-gold border border-gold/40'
                          : 'text-cream-dim hover:text-foreground border border-transparent'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </header>

          {/* Menu content */}
          <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
            {searchQuery.trim() ? (
              <p className="font-body text-xs text-cream-dim mb-4">
                {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            ) : (
              <h2 className="font-display text-xl tracking-wider text-foreground mb-6">{activeCategory}</h2>
            )}

            {filteredItems.length === 0 ? (
              <p className="font-body text-sm text-cream-dim text-center py-12">No items found</p>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredItems.map((item, idx) => {
                  const status = stockStatus[item.id];
                  const isSoldOut = !isBrowseOnly && (status?.soldOut || false);
                  const isLowStock = isStaff && (status?.lowStock || false);
                  return (
                    <button
                      key={item.id}
                      onClick={() => { if (!isSoldOut) { setSelectedItem(item); setAddQuantity(1); } }}
                      disabled={isSoldOut}
                      className={`text-left animate-fade-in group py-3 px-3 -mx-3 rounded-lg transition-colors ${
                        isSoldOut ? 'opacity-50 cursor-not-allowed' : 'active:bg-foreground/5'
                      }`}
                      style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-display text-sm transition-colors block ${
                              isSoldOut ? 'text-muted-foreground line-through' : 'text-foreground group-hover:text-gold'
                            }`}>
                              {item.name}
                            </span>
                            {isSoldOut && (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Sold Out</Badge>
                            )}
                            {!isSoldOut && isLowStock && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/50 text-amber-400">Low Stock</Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="font-body text-xs text-cream-dim mt-0.5 leading-relaxed line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <span className={`font-display text-sm whitespace-nowrap pt-0.5 ${isSoldOut ? 'text-muted-foreground' : 'text-gold'}`}>
                          ₱{item.price.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>

          {/* Floating cart button - hidden in browse-only guest mode */}
          {!isBrowseOnly && cart.count() > 0 && (
            <button
              onClick={() => setCartOpen(true)}
              className={`fixed ${isStaff ? 'bottom-20' : 'bottom-6'} left-4 right-4 z-40 max-w-md mx-auto h-14 rounded-xl bg-gold text-primary-foreground flex items-center justify-between px-5 shadow-lg active:scale-[0.98] transition-transform`}
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                <span className="font-display text-sm tracking-wider">
                  {cart.count()} item{cart.count() !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="font-display text-sm tracking-wider">
                ₱{cart.total().toLocaleString()}
              </span>
            </button>
          )}
        </>
      ) : (
        /* Orders view for staff */
        <div className="flex-1 flex flex-col">
          <div className="sticky top-0 z-30 bg-navy-deep/95 backdrop-blur-sm border-b border-border">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
              <button onClick={() => navigate('/')} className="text-cream-dim hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                <Home className="w-5 h-5" />
              </button>
              <h1 className="font-display text-lg tracking-[0.15em] text-foreground">ORDERS</h1>
              <div className="w-[44px]" />
            </div>
          </div>
          <StaffOrdersView />
        </div>
      )}

      {/* Item detail modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="bg-card border-border max-w-xs mx-4">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground tracking-wider text-center text-lg">
              {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="flex flex-col items-center gap-5 pt-2">
              <p className="font-body text-sm text-cream-dim text-center leading-relaxed">{selectedItem.description}</p>
              <p className="font-display text-2xl text-gold">₱{selectedItem.price.toLocaleString()}</p>
              {!isBrowseOnly && (
                <>
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                      className="w-12 h-12 border border-border rounded-full flex items-center justify-center text-foreground hover:border-gold active:bg-foreground/5 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-display text-2xl text-foreground w-8 text-center">{addQuantity}</span>
                    <button
                      onClick={() => setAddQuantity(addQuantity + 1)}
                      className="w-12 h-12 border border-border rounded-full flex items-center justify-center text-foreground hover:border-gold active:bg-foreground/5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <Button onClick={handleAddToCart} className="w-full font-display tracking-wider py-6 text-base">
                    Add to Order — ₱{(selectedItem.price * addQuantity).toLocaleString()}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cart drawer */}
      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        mode={mode}
        orderType={isGuestOrder && guestSession ? 'Room' : orderType}
        locationDetail={isGuestOrder && guestSession ? guestSession.room_name : location}
        initialGuestName={isGuestOrder && guestSession ? guestSession.guest_name : initialGuestName}
      />

      {/* Bottom nav bar - staff only */}
      {isStaff && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="max-w-2xl mx-auto flex">
            <button
              onClick={() => setStaffTab('menu')}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] gap-0.5 transition-colors ${
                staffTab === 'menu' ? 'text-gold' : 'text-cream-dim'
              }`}
            >
              <UtensilsCrossed className="w-5 h-5" />
              <span className="font-body text-[10px] tracking-wider">Menu</span>
            </button>
            <button
              onClick={() => setStaffTab('orders')}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] gap-0.5 transition-colors relative ${
                staffTab === 'orders' ? 'text-gold' : 'text-cream-dim'
              }`}
            >
              <ClipboardList className="w-5 h-5" />
              <span className="font-body text-[10px] tracking-wider">Orders</span>
              {activeOrderCount > 0 && (
                <span className="absolute top-1.5 right-1/4 bg-destructive text-destructive-foreground text-[10px] font-body font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {activeOrderCount}
                </span>
              )}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default MenuPage;
