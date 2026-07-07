import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronLeft, ChevronRight, Plus, Calendar, Wrench } from 'lucide-react';
import { format, addDays, addWeeks, addMonths, subWeeks, subMonths, parseISO, isSameDay } from 'date-fns';
import {
  getDateRange, getDaysInRange, bookingOverlapsDate, bookingOverlapsRange,
  getBookingStatus, statusColors, findConflicts, findAvailableRooms,
  type CalendarView, type BookingWithGuest, type ResortUnit,
} from './calendarUtils';
import AddReservationModal from './AddReservationModal';
import PendingCharges from './PendingCharges'; // Force rebuild

interface UnitWithStatus {
  id: string;
  unit_name?: string;
  name?: string;
  status?: string;
}

interface ReceptionCalendarProps {
  bookings: BookingWithGuest[];
  rooms: ResortUnit[];
  units: UnitWithStatus[];
  canEdit: boolean;
  canManage: boolean;
}

const ReceptionCalendar = ({ bookings, rooms, units, canEdit, canManage }: ReceptionCalendarProps) => {
  const [view, setView] = useState<CalendarView>('week');
  const [refDate, setRefDate] = useState(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<BookingWithGuest | null>(null);

  const { start, end } = useMemo(() => getDateRange(refDate, view), [refDate, view]);
  const days = useMemo(() => getDaysInRange(start, end), [start, end]);

  // Filter bookings that overlap the visible range
  const visibleBookings = useMemo(() =>
    bookings.filter(b => bookingOverlapsRange(b, start, end)),
    [bookings, start, end]
  );

  const navigate = (dir: 'prev' | 'next') => {
    setRefDate(d => {
      if (view === 'week') return dir === 'next' ? addWeeks(d, 1) : subWeeks(d, 1);
      if (view === '2week') return dir === 'next' ? addWeeks(d, 2) : subWeeks(d, 2);
      return dir === 'next' ? addMonths(d, 1) : subMonths(d, 1);
    });
  };

  const goToday = () => setRefDate(new Date());

  const getRoomName = (unitId: string | null) => {
    if (!unitId) return '—';
    return rooms.find(r => r.id === unitId)?.name || '—';
  };

  const handleBookingClick = (booking: BookingWithGuest) => {
    if (!canEdit) return;
    setEditBooking(booking);
    setAddOpen(true);
  };

  /** Render a booking chip with status-aware coloring for a specific day */
  const renderBookingChip = (b: BookingWithGuest, day: Date, showRoom = true) => {
    const status = getBookingStatus(b, day);
    const colors = statusColors[status];
    const guestName = b.platform === 'Maintenance' ? '🔧 Maintenance' : (b.resort_ops_guests?.full_name || 'No name');

    const isCI = isSameDay(day, parseISO(b.check_in));
    const isCO = isSameDay(day, parseISO(b.check_out));

    // For turnover cells on desktop, show a compact tag
    const tag = isCO ? 'OUT' : isCI ? 'IN' : null;

    return (
      <button
        key={b.id}
        onClick={() => handleBookingClick(b)}
        className={`w-full text-left rounded-md px-2 py-1 border text-xs font-body truncate ${colors.bg} ${colors.text} ${colors.border} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
      >
        <span className="truncate block">
          {guestName}
          {tag && <span className="text-[9px] opacity-60 ml-0.5">({tag})</span>}
          {showRoom && <span className="text-[10px] opacity-70 ml-1">• {getRoomName(b.unit_id)}</span>}
        </span>
      </button>
    );
  };

  // ─── MOBILE VIEW: Stacked day cards ───
  const renderMobileView = () => (
    <div className="space-y-2 md:hidden">
      {days.map(day => {
        const dayBookings = visibleBookings.filter(b => bookingOverlapsDate(b, day));
        const isToday = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className={`rounded-lg border p-3 space-y-1.5 ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
          >
            <p className={`font-display text-xs tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
              {format(day, 'EEE, MMM d')}
              {isToday && <Badge variant="outline" className="ml-2 text-[9px] py-0">Today</Badge>}
            </p>
            {dayBookings.length === 0 && (
              <p className="text-[11px] text-muted-foreground font-body italic">No bookings</p>
            )}
            {dayBookings.map(b => {
              const status = getBookingStatus(b, day);
              const colors = statusColors[status];
              const guestName = b.platform === 'Maintenance' ? '🔧 Maintenance' : (b.resort_ops_guests?.full_name || 'No name');
              const isCI = isSameDay(day, parseISO(b.check_in));
              const isCO = isSameDay(day, parseISO(b.check_out));
              return (
                <button
                  key={b.id}
                  onClick={() => handleBookingClick(b)}
                  className={`w-full text-left rounded-md px-3 py-2 border ${colors.bg} ${colors.text} ${colors.border} ${canEdit ? 'active:opacity-70' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-body text-sm truncate">{guestName}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCO && <Badge variant="outline" className="text-[9px] py-0 border-orange-500/40 text-orange-400">OUT</Badge>}
                      {isCI && <Badge variant="outline" className="text-[9px] py-0 border-emerald-500/40 text-emerald-400">IN</Badge>}
                    </div>
                  </div>
                  <p className="font-body text-[11px] opacity-70 mt-0.5">
                    {getRoomName(b.unit_id)} • {format(parseISO(b.check_in), 'MMM d')} → {format(parseISO(b.check_out), 'MMM d')}
                  </p>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ─── DESKTOP VIEW: Grid with rooms as rows ───
  const renderDesktopView = () => (
    <div className="hidden md:block overflow-hidden">
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header row with dates */}
        <div className="grid bg-secondary/50" style={{ gridTemplateColumns: `120px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="px-2 py-2 border-r border-b border-border">
            <span className="font-display text-[10px] tracking-wider text-muted-foreground">ROOM</span>
          </div>
          {days.map(day => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className={`px-1 py-2 text-center border-r border-b border-border last:border-r-0 ${isToday ? 'bg-primary/10' : ''}`}>
                <p className={`font-display text-[9px] tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(day, 'EEE')}
                </p>
                <p className={`font-display text-xs ${isToday ? 'text-primary font-bold' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </p>
              </div>
            );
          })}
        </div>

        {/* Room rows */}
        {rooms.map(room => (
          <div
            key={room.id}
            className="grid border-b border-border last:border-b-0"
            style={{ gridTemplateColumns: `120px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div className="px-2 py-1.5 border-r border-border flex items-center">
              <span className="font-display text-[11px] tracking-wider text-foreground truncate">{room.name}</span>
            </div>
            {days.map(day => {
              const dayBookings = visibleBookings.filter(b =>
                b.unit_id === room.id && bookingOverlapsDate(b, day)
              );
              const isToday = isSameDay(day, new Date());

              // Detect turnover: one booking checking out + another checking in on same day
              const departingBooking = dayBookings.find(b => isSameDay(day, parseISO(b.check_out)) && !b.checked_out_at);
              const arrivingBooking = dayBookings.find(b => isSameDay(day, parseISO(b.check_in)));
              const isTurnover = Boolean(departingBooking && arrivingBooking && departingBooking.id !== arrivingBooking.id);

              if (isTurnover && departingBooking && arrivingBooking) {
                // Split cell: departing on top, arriving on bottom
                return (
                  <div
                    key={day.toISOString()}
                    className={`px-0.5 py-0.5 border-r border-border last:border-r-0 min-h-[32px] flex flex-col gap-0.5 ${isToday ? 'bg-primary/5' : ''}`}
                  >
                    {renderBookingChip(departingBooking, day, false)}
                    {renderBookingChip(arrivingBooking, day, false)}
                  </div>
                );
              }

              return (
                <div
                  key={day.toISOString()}
                  className={`px-0.5 py-0.5 border-r border-border last:border-r-0 min-h-[32px] ${isToday ? 'bg-primary/5' : ''}`}
                >
                  {dayBookings.map(b => renderBookingChip(b, day, false))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Pending Room Charges Section */}
      <PendingCharges />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg tracking-wider text-foreground">Booking Calendar</h2>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditBooking(null); setAddOpen(true); }} className="font-display text-xs tracking-wider">
              <Plus className="h-3.5 w-3.5 mr-1" /> Reservation
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditBooking(null);
                setAddOpen(true);
              }}
              className="font-display text-xs tracking-wider text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              <Wrench className="h-3.5 w-3.5 mr-1" /> Block Room
            </Button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <ToggleGroup type="single" value={view} onValueChange={v => v && setView(v as CalendarView)} className="bg-secondary rounded-lg p-0.5">
          <ToggleGroupItem value="week" className="font-display text-[10px] tracking-wider px-3 h-7">Week</ToggleGroupItem>
          <ToggleGroupItem value="2week" className="font-display text-[10px] tracking-wider px-3 h-7">2 Weeks</ToggleGroupItem>
          <ToggleGroupItem value="month" className="font-display text-[10px] tracking-wider px-3 h-7">Month</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className="h-7 w-7">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="font-display text-[10px] tracking-wider h-7 px-2">
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate('next')} className="h-7 w-7">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-display text-sm tracking-wider text-foreground ml-2">
            {format(start, 'MMM d')} — {format(end, 'MMM d, yyyy')}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] font-body text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/50" /> Occupied</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/50" /> Departing</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/50" /> Arriving</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/50" /> Upcoming</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted/50" /> Checked Out</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/50" /> Blocked</span>
      </div>

      {/* Views */}
      {renderMobileView()}
      {renderDesktopView()}

      {/* Add/Edit Modal */}
      <AddReservationModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditBooking(null); }}
        rooms={rooms}
        bookings={bookings}
        canManage={canManage}
        editBooking={editBooking}
      />
    </div>
  );
};

export default ReceptionCalendar;
