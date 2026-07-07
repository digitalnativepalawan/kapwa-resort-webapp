export interface OperationalBookingDates {
  check_in: string;
  check_out: string;
}

export interface OperationalGuestLike {
  full_name?: string | null;
}

export interface OperationalBookingLike extends OperationalBookingDates {
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  resort_ops_guests?: OperationalGuestLike | null;
  guest_name?: string | null;
}

export type OperationalUnitStatus = 'occupied' | 'to_clean' | 'ready';

export interface OperationalUnitWorkflow<TBooking extends OperationalBookingLike = OperationalBookingLike> {
  displayStatus: OperationalUnitStatus;
  activeBooking: TBooking | null;
  pendingArrival: TBooking | null;
  pendingDeparture: TBooking | null;
  todayArrival: TBooking | null;
  todayDeparture: TBooking | null;
  derivedOccupiedBooking: TBooking | null;
  isTurnover: boolean;
  isExtensionReview: boolean;
}

export const getManilaDateKey = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

const isBookingCheckedOut = (booking: OperationalBookingLike | null | undefined) =>
  Boolean(booking?.checked_out_at);

const isBookingCheckedIn = (booking: OperationalBookingLike | null | undefined) =>
  Boolean(booking?.checked_in_at) && !isBookingCheckedOut(booking);

export const doesBookingCoverOperationalDay = (
  booking: OperationalBookingLike | null | undefined,
  today = getManilaDateKey(),
) => {
  if (!booking?.check_in || !booking?.check_out || isBookingCheckedOut(booking)) return false;
  return booking.check_in <= today && booking.check_out >= today;
};

export const shouldTreatBookingAsOccupiedWithoutManualCheckIn = (
  booking: OperationalBookingLike | null | undefined,
  today = getManilaDateKey(),
) => {
  if (!booking?.check_in || !booking?.check_out) return false;
  if (booking.checked_in_at || booking.checked_out_at) return false;
  return booking.check_in < today && booking.check_out > today;
};

const getOperationalGuestName = (booking: OperationalBookingLike | null | undefined) =>
  booking?.resort_ops_guests?.full_name || booking?.guest_name || '';

const getNameTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2);

export const areLikelySameGuestNames = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const leftTokens = getNameTokens(left || '');
  const rightTokens = getNameTokens(right || '');

  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const sharedTokens = leftTokens.filter(token => rightTokens.includes(token));
  if (sharedTokens.length >= 2) return true;

  const leftFirst = leftTokens[0];
  const leftLast = leftTokens[leftTokens.length - 1];
  const rightFirst = rightTokens[0];
  const rightLast = rightTokens[rightTokens.length - 1];

  return leftFirst === rightFirst && leftLast === rightLast;
};

export const resolveOperationalUnitWorkflow = <TBooking extends OperationalBookingLike>(params: {
  bookings: TBooking[];
  rawStatus?: string | null;
  today?: string;
}): OperationalUnitWorkflow<TBooking> => {
  const { bookings, rawStatus, today = getManilaDateKey() } = params;

  const openBookings = bookings.filter(booking => !isBookingCheckedOut(booking));
  const todayArrival = openBookings.find(booking => booking.check_in === today) || null;
  const todayDeparture = openBookings.find(
    booking => booking.check_out === today && isBookingCheckedIn(booking),
  ) || null;
  const checkedInBooking = openBookings.find(
    booking => isBookingCheckedIn(booking) && doesBookingCoverOperationalDay(booking, today),
  ) || null;
  const derivedOccupiedBooking = checkedInBooking || openBookings.find(
    booking => shouldTreatBookingAsOccupiedWithoutManualCheckIn(booking, today),
  ) || null;

  const isTurnover = Boolean(todayArrival && todayDeparture);
  const isExtensionReview =
    isTurnover &&
    areLikelySameGuestNames(
      getOperationalGuestName(todayDeparture),
      getOperationalGuestName(todayArrival),
    );

  const housekeepingStatus = rawStatus === 'to_clean' || rawStatus === 'dirty' || rawStatus === 'cleaning';

  const activeBooking = housekeepingStatus ? null : derivedOccupiedBooking;

  const pendingDeparture =
    !housekeepingStatus && todayDeparture && !isExtensionReview ? todayDeparture : null;

  const pendingArrival =
    todayArrival && !todayArrival.checked_in_at ? todayArrival : null;

  return {
    displayStatus: housekeepingStatus ? 'to_clean' : activeBooking ? 'occupied' : 'ready',
    activeBooking,
    pendingArrival,
    pendingDeparture,
    todayArrival,
    todayDeparture,
    derivedOccupiedBooking,
    isTurnover,
    isExtensionReview,
  };
};
