import { addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, format, parseISO, isWithinInterval, isBefore, isAfter, isSameDay } from 'date-fns';

export type CalendarView = 'week' | '2week' | 'month';

export interface BookingWithGuest {
  id: string;
  unit_id: string | null;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  platform: string;
  room_rate: number;
  adults: number;
  children: number;
  notes: string | null;
  paid_amount: number;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  resort_ops_guests?: { id: string; full_name: string; email: string | null; phone: string | null } | null;
}

export interface ResortUnit {
  id: string;
  name: string;
  type: string;
  base_price: number;
  capacity: number;
}

/** Get the date range for a given view anchored to a reference date */
export const getDateRange = (refDate: Date, view: CalendarView): { start: Date; end: Date } => {
  switch (view) {
    case 'week': {
      const start = startOfWeek(refDate, { weekStartsOn: 1 });
      return { start, end: addDays(start, 6) };
    }
    case '2week': {
      const start = startOfWeek(refDate, { weekStartsOn: 1 });
      return { start, end: addDays(start, 13) };
    }
    case 'month':
      return { start: startOfMonth(refDate), end: endOfMonth(refDate) };
  }
};

/** Get array of dates for the range */
export const getDaysInRange = (start: Date, end: Date): Date[] =>
  eachDayOfInterval({ start, end });

/**
 * Check if a booking overlaps with a specific date.
 * Includes the checkout day so turnover cells show both departing and arriving guests.
 */
export const bookingOverlapsDate = (booking: BookingWithGuest, date: Date): boolean => {
  const checkIn = parseISO(booking.check_in);
  const checkOut = parseISO(booking.check_out);
  // Active from check_in day through check_out day (inclusive on both ends for calendar display)
  return (isSameDay(date, checkIn) || isAfter(date, checkIn)) &&
         (isSameDay(date, checkOut) || isBefore(date, checkOut));
};

/** Check if a booking overlaps with a date range */
export const bookingOverlapsRange = (booking: BookingWithGuest, start: Date, end: Date): boolean => {
  const checkIn = parseISO(booking.check_in);
  const checkOut = parseISO(booking.check_out);
  // Overlap: booking starts before range ends AND booking ends after range starts
  return isBefore(checkIn, addDays(end, 1)) && isAfter(checkOut, start);
};

/** Find conflicting bookings for a unit in a date range */
export const findConflicts = (
  bookings: BookingWithGuest[],
  unitId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
): BookingWithGuest[] => {
  const ciDate = parseISO(checkIn);
  const coDate = parseISO(checkOut);
  return bookings.filter(b => {
    if (b.unit_id !== unitId) return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const bIn = parseISO(b.check_in);
    const bOut = parseISO(b.check_out);
    // Overlap: one starts before the other ends
    return isBefore(bIn, coDate) && isAfter(bOut, ciDate);
  });
};

/** Find available rooms for a date range */
export const findAvailableRooms = (
  rooms: ResortUnit[],
  bookings: BookingWithGuest[],
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
): ResortUnit[] => {
  return rooms.filter(room => {
    const conflicts = findConflicts(bookings, room.id, checkIn, checkOut, excludeBookingId);
    return conflicts.length === 0;
  });
};

/**
 * Get booking status for color coding based on real occupancy.
 * On checkout day, guest is still "occupied" until they actually check out (checked_out_at).
 * This reflects resort reality: guests check out before noon, not at midnight.
 */
export const getBookingStatus = (
  booking: BookingWithGuest,
  date?: Date,
): 'occupied' | 'upcoming' | 'checked_out' | 'blocked' | 'departing' | 'arriving' => {
  if (booking.platform === 'Maintenance') return 'blocked';

  const today = date || new Date();
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const checkInDate = parseISO(booking.check_in);
  const checkOutDate = parseISO(booking.check_out);

  // Actually checked out (has checked_out_at timestamp)
  if (booking.checked_out_at) return 'checked_out';

  // Checkout day — guest is still in-house, departing
  if (isSameDay(today, checkOutDate)) return 'departing';

  // Past checkout date without checked_out_at — stale data, treat as checked out
  if (booking.check_out < todayStr) return 'checked_out';

  // Check-in day — arriving
  if (isSameDay(today, checkInDate)) {
    // Already checked in today
    if (booking.checked_in_at) return 'occupied';
    return 'arriving';
  }

  // Currently staying (between check-in and check-out)
  if (booking.check_in <= todayStr && booking.check_out > todayStr) return 'occupied';

  // Future booking
  return 'upcoming';
};

/** Status colors using semantic tokens */
export const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  occupied: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' },
  upcoming: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' },
  checked_out: { bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border' },
  blocked: { bg: 'bg-destructive/20', text: 'text-destructive', border: 'border-destructive/40' },
  departing: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40' },
  arriving: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
};
