import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { shouldTreatBookingAsOccupiedWithoutManualCheckIn } from '@/lib/receptionOccupancy';
import { toast } from 'sonner';

const from = (table: string) => supabase.from(table as any);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guests: any[];
  units: any[];
  onComplete: () => void;
}

type ImportFieldKey =
  | 'guestName'
  | 'email'
  | 'phone'
  | 'reservationNumber'
  | 'thirdPartyConfirmation'
  | 'adults'
  | 'children'
  | 'roomNumber'
  | 'accommodationTotal'
  | 'amountPaid'
  | 'checkIn'
  | 'checkOut'
  | 'nights'
  | 'roomType'
  | 'grandTotal'
  | 'deposit'
  | 'balanceDue'
  | 'reservationDate'
  | 'source'
  | 'status'
  | 'country'
  | 'notes';

interface ParsedRow {
  idx: number;
  guestName: string;
  email: string;
  phone: string;
  reservationNumber: string;
  thirdPartyConfirmation: string;
  adults: number;
  children: number;
  roomNumber: string;
  roomNumbers: string[];
  accommodationTotal: number;
  amountPaid: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomType: string;
  grandTotal: number;
  deposit: number;
  balanceDue: number;
  reservationDate: string;
  source: string;
  status: string;
  country: string;
  notes: string;
  platform: string;
  externalReservationId: string;
  raw: Record<string, string>;
  errors: string[];
  selected: boolean;
}

interface ImportResult {
  imported: number;
  importedRows: number;
  skipped: number;
  errors: string[];
}

const TEMPLATE_HEADERS = 'Name,Email,Phone Number,Reservation Number,Third Party Confirmation Number,Adults,Children,Room Number,Accommodation Total,Amount Paid,Check in Date,Check out Date,Nights,Room Type,Grand Total,Deposit,Products,Balance Due,Credit Card Type,Reservation Date,Source,Meal Plan,Status,Country,Guest Status,Cancellation Date,Estimated Arrival Time,Origin,Cancellation fee,Canceled By,Company Name,Company Tax ID Number,Guest Tax ID Number';
const TEMPLATE_EXAMPLE = 'John Doe,john@email.com,+63 912 345 6789,ABC123,,2,0,COT(1),5000,0,15/04/2026,18/04/2026,3,Cottages,5000,2500,n/a,5000,n/a,10/03/2026,Walk-In,,Confirmed,Philippines,,,Unknown,,,,,,';

const FIELD_ALIASES: Record<ImportFieldKey, string[]> = {
  guestName: ['Name', 'Guest Name'],
  email: ['Email'],
  phone: ['Phone Number', 'Mobile', 'Phone'],
  reservationNumber: ['Reservation Number'],
  thirdPartyConfirmation: ['Third Party Confirmation Number'],
  adults: ['Adults', 'Guests'],
  children: ['Children'],
  roomNumber: ['Room Number', 'Units'],
  accommodationTotal: ['Accommodation Total', 'Accommodation Total Amount'],
  amountPaid: ['Amount Paid', 'Paid So Far Realized'],
  checkIn: ['Check in Date', 'Check In'],
  checkOut: ['Check out Date', 'Check Out'],
  nights: ['Nights'],
  roomType: ['Room Type'],
  grandTotal: ['Grand Total'],
  deposit: ['Deposit'],
  balanceDue: ['Balance Due'],
  reservationDate: ['Reservation Date'],
  source: ['Source', 'Platform'],
  status: ['Status'],
  country: ['Country'],
  notes: ['Notes'],
};

const QUERY_KEYS_TO_INVALIDATE = [
  ['resort-ops-units'],
  ['resort-ops-guests'],
  ['resort-ops-bookings'],
  ['rooms-units'],
  ['rooms-bookings'],
  ['all-guests'],
  ['morning-briefing'],
  ['housekeeping-orders'],
  ['housekeeping-orders-all'],
];

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeHeader = (value: string) => normalizeText(value).replace(/[^a-z0-9]/g, '');
const normalizeRoomName = (value: string) => normalizeText(value).replace(/\s+/g, ' ');

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      currentRow.push(currentValue.trim());
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += ch;
  }

  currentRow.push(currentValue.trim());
  rows.push(currentRow);

  return rows
    .map((row) => row.map((cell) => cell.replace(/^\uFEFF/, '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function parseDateDDMMYYYY(value: string): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  const day = dd.padStart(2, '0');
  const month = mm.padStart(2, '0');
  const iso = `${yyyy}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: string, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = value.replace(/[^\d-]/g, '');
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getHeaderValue(cells: string[], headerMap: Map<string, number>, key: ImportFieldKey): string {
  let firstMatchIndex: number | undefined;

  for (const alias of FIELD_ALIASES[key]) {
    const idx = headerMap.get(normalizeHeader(alias));
    if (idx === undefined) continue;
    if (firstMatchIndex === undefined) firstMatchIndex = idx;
    const value = cells[idx]?.trim() || '';
    if (value) return value;
  }

  return firstMatchIndex !== undefined ? cells[firstMatchIndex]?.trim() || '' : '';
}

function splitRoomNumbers(value: string): string[] {
  return value
    .split(',')
    .map((room) => room.trim())
    .filter(Boolean);
}

function cleanOptionalValue(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return '';
  const normalized = normalizeText(cleaned);
  if (['n/a', 'na', 'none', 'unknown', '-'].includes(normalized)) return '';
  return cleaned;
}

function resolvePlatform(source: string): string {
  const normalized = normalizeText(source);
  if (!normalized) return 'Direct';
  if (normalized.includes('booking.com') || normalized.includes('bookingcom')) return 'Booking.com';
  if (normalized.includes('airbnb')) return 'Airbnb';
  if (normalized.includes('agoda')) return 'Agoda';
  if (normalized.includes('website')) return 'Website';
  if (normalized.includes('walk-in') || normalized.includes('walk in') || normalized.includes('front desk') || normalized.includes('direct')) return 'Direct';
  return source.trim();
}

function isCancelledStatus(status: string): boolean {
  const normalized = normalizeText(status);
  return normalized.includes('cancelled') || normalized.includes('canceled');
}

function getTodayManila(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function shouldSyncImportedRoomAsOccupied(checkIn: string, checkOut: string): boolean {
  return shouldTreatBookingAsOccupiedWithoutManualCheckIn(
    { check_in: checkIn, check_out: checkOut },
    getTodayManila(),
  );
}

function deriveNightlyRate(row: ParsedRow): number {
  const roomCount = Math.max(row.roomNumbers.length, 1);
  const nights = row.nights > 0 ? row.nights : 0;

  if (row.accommodationTotal > 0 && nights > 0) {
    return row.accommodationTotal / nights / roomCount;
  }

  if (row.grandTotal > 0 && nights > 0) {
    return row.grandTotal / nights / roomCount;
  }

  if (row.accommodationTotal > 0) {
    return row.accommodationTotal / roomCount;
  }

  if (row.grandTotal > 0) {
    return row.grandTotal / roomCount;
  }

  return 0;
}

function buildBookingNotes(row: ParsedRow, roomName: string): string {
  const notes: string[] = [];
  if (row.notes) notes.push(row.notes);
  if (row.country) notes.push(`Country: ${row.country}`);
  if (row.deposit > 0) notes.push(`Deposit: ₱${row.deposit.toFixed(2)}`);
  if (row.balanceDue > 0) notes.push(`Balance due: ₱${row.balanceDue.toFixed(2)}`);
  if (row.thirdPartyConfirmation) notes.push(`Third-party confirmation: ${row.thirdPartyConfirmation}`);
  if (row.roomNumbers.length > 1) notes.push(`Imported room: ${roomName}`);
  return notes.join(' • ');
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const normalized = normalizeText(status);
  if (normalized.includes('cancel')) return 'destructive';
  if (normalized.includes('in-house') || normalized.includes('inhouse')) return 'default';
  if (normalized.includes('checked out')) return 'secondary';
  return 'outline';
}

function validateRow(
  row: ParsedRow,
  existingExternalIds: Set<string>,
  fileDuplicateIds: Set<string>,
): string[] {
  const errors: string[] = [];

  if (!row.guestName) errors.push('Missing guest name');
  if (!row.checkIn) errors.push('Missing or invalid check-in date (dd/mm/yyyy)');
  if (!row.checkOut) errors.push('Missing or invalid check-out date (dd/mm/yyyy)');
  if (row.checkIn && row.checkOut && row.checkOut <= row.checkIn) errors.push('Check-out must be after check-in');
  if (!row.roomNumber || row.roomNumbers.length === 0) errors.push('Missing room number');
  if (row.adults < 0) errors.push('Adults must be 0 or greater');
  if (row.children < 0) errors.push('Children must be 0 or greater');
  if (isCancelledStatus(row.status)) errors.push('Cancelled reservation skipped');

  const externalIdKey = normalizeText(row.externalReservationId);
  if (externalIdKey && existingExternalIds.has(externalIdKey)) {
    errors.push(`Duplicate reservation already exists: ${row.externalReservationId}`);
  }
  if (externalIdKey && fileDuplicateIds.has(externalIdKey)) {
    errors.push(`Duplicate reservation number appears more than once in this CSV: ${row.externalReservationId}`);
  }

  return [...new Set(errors)];
}

const ImportReservationsModal = ({ open, onOpenChange, guests, units, onComplete }: Props) => {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = `${TEMPLATE_HEADERS}\n${TEMPLATE_EXAMPLE}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reservations_template.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = (e.target?.result as string) || '';
        const table = parseCSV(text);

        if (table.length < 2) {
          toast.error('CSV has no data rows');
          return;
        }

        const headers = table[0];
        const headerMap = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
        const requiredFields: ImportFieldKey[] = ['guestName', 'roomNumber', 'checkIn', 'checkOut'];
        const missingHeaders = requiredFields.filter((field) =>
          !FIELD_ALIASES[field].some((alias) => headerMap.has(normalizeHeader(alias))),
        );

        if (missingHeaders.length > 0) {
          toast.error('CSV header is missing required reservation columns');
          return;
        }

        const dataRows = table.slice(1);
        const existingIdsInFile = new Map<string, number>();
        const externalIdsToCheck = new Set<string>();

        const parsed = dataRows.map((cells, index) => {
          const guestName = cleanOptionalValue(getHeaderValue(cells, headerMap, 'guestName'));
          const email = cleanOptionalValue(getHeaderValue(cells, headerMap, 'email'));
          const phone = cleanOptionalValue(getHeaderValue(cells, headerMap, 'phone'));
          const reservationNumber = cleanOptionalValue(getHeaderValue(cells, headerMap, 'reservationNumber'));
          const thirdPartyConfirmation = cleanOptionalValue(getHeaderValue(cells, headerMap, 'thirdPartyConfirmation'));
          const roomNumber = cleanOptionalValue(getHeaderValue(cells, headerMap, 'roomNumber'));
          const checkInRaw = cleanOptionalValue(getHeaderValue(cells, headerMap, 'checkIn'));
          const checkOutRaw = cleanOptionalValue(getHeaderValue(cells, headerMap, 'checkOut'));
          const source = cleanOptionalValue(getHeaderValue(cells, headerMap, 'source'));
          const status = cleanOptionalValue(getHeaderValue(cells, headerMap, 'status')) || 'Confirmed';
          const externalReservationId = reservationNumber || thirdPartyConfirmation;

          const raw = headers.reduce<Record<string, string>>((acc, header, headerIndex) => {
            acc[header] = cells[headerIndex] || '';
            return acc;
          }, {});

          const row: ParsedRow = {
            idx: index + 1,
            guestName,
            email,
            phone,
            reservationNumber,
            thirdPartyConfirmation,
            adults: parseInteger(getHeaderValue(cells, headerMap, 'adults'), 1),
            children: parseInteger(getHeaderValue(cells, headerMap, 'children'), 0),
            roomNumber,
            roomNumbers: splitRoomNumbers(roomNumber),
            accommodationTotal: parseNumber(getHeaderValue(cells, headerMap, 'accommodationTotal')),
            amountPaid: parseNumber(getHeaderValue(cells, headerMap, 'amountPaid')),
            checkIn: parseDateDDMMYYYY(checkInRaw) || '',
            checkOut: parseDateDDMMYYYY(checkOutRaw) || '',
            nights: parseInteger(getHeaderValue(cells, headerMap, 'nights'), 0),
            roomType: cleanOptionalValue(getHeaderValue(cells, headerMap, 'roomType')),
            grandTotal: parseNumber(getHeaderValue(cells, headerMap, 'grandTotal')),
            deposit: parseNumber(getHeaderValue(cells, headerMap, 'deposit')),
            balanceDue: parseNumber(getHeaderValue(cells, headerMap, 'balanceDue')),
            reservationDate: parseDateDDMMYYYY(cleanOptionalValue(getHeaderValue(cells, headerMap, 'reservationDate'))) || '',
            source,
            status,
            country: cleanOptionalValue(getHeaderValue(cells, headerMap, 'country')),
            notes: cleanOptionalValue(getHeaderValue(cells, headerMap, 'notes')),
            platform: resolvePlatform(source),
            externalReservationId,
            raw,
            errors: [],
            selected: true,
          };

          if (checkInRaw && !row.checkIn) row.errors.push(`Invalid check-in date "${checkInRaw}" (use dd/mm/yyyy)`);
          if (checkOutRaw && !row.checkOut) row.errors.push(`Invalid check-out date "${checkOutRaw}" (use dd/mm/yyyy)`);

          const key = normalizeText(externalReservationId);
          if (key) {
            existingIdsInFile.set(key, (existingIdsInFile.get(key) || 0) + 1);
            externalIdsToCheck.add(externalReservationId);
          }

          return row;
        });

        const duplicateIdsInFile = new Set(
          [...existingIdsInFile.entries()].filter(([, count]) => count > 1).map(([id]) => id),
        );

        let existingExternalIds = new Set<string>();
        if (externalIdsToCheck.size > 0) {
          const { data, error } = await from('resort_ops_bookings')
            .select('external_reservation_id')
            .in('external_reservation_id', [...externalIdsToCheck]);

          if (error) {
            toast.error(`Failed to validate duplicates: ${error.message}`);
            return;
          }

          existingExternalIds = new Set(
            ((data as any[]) || [])
              .map((booking) => normalizeText(booking.external_reservation_id || ''))
              .filter(Boolean),
          );
        }

        const validatedRows = parsed.map((row) => {
          const errors = [...row.errors, ...validateRow(row, existingExternalIds, duplicateIdsInFile)];
          return {
            ...row,
            errors: [...new Set(errors)],
            selected: errors.length === 0,
          };
        });

        setRows(validatedRows);
        setShowOnlyIssues(validatedRows.some((row) => row.errors.length > 0));
        setResult(null);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to parse CSV');
      }
    };

    reader.readAsText(file);
  };

  const toggleAll = (checked: boolean) => {
    setRows((prev) => prev.map((row) => ({ ...row, selected: row.errors.length === 0 ? checked : false })));
  };

  const toggleRow = (idx: number) => {
    setRows((prev) => prev.map((row) => (row.idx === idx && row.errors.length === 0 ? { ...row, selected: !row.selected } : row)));
  };

  const doImport = async () => {
    const selectedRows = rows.filter((row) => row.selected && row.errors.length === 0);
    if (selectedRows.length === 0) return;

    setImporting(true);

    try {
      const [displayUnitsRes, roomTypesRes, existingBookingsRes] = await Promise.all([
        supabase.from('units').select('id, unit_name, status, room_type_id, active'),
        supabase.from('room_types').select('id, name'),
        from('resort_ops_bookings')
          .select('external_reservation_id')
          .in('external_reservation_id', selectedRows.map((row) => row.externalReservationId).filter(Boolean)),
      ]);

      if (displayUnitsRes.error) throw new Error(displayUnitsRes.error.message);
      if (roomTypesRes.error) throw new Error(roomTypesRes.error.message);
      if (existingBookingsRes.error) throw new Error(existingBookingsRes.error.message);

      const displayUnits = (displayUnitsRes.data || []) as any[];
      const roomTypes = (roomTypesRes.data || []) as any[];
      const existingDuplicateIds = new Set(
        ((existingBookingsRes.data as any[]) || [])
          .map((booking) => normalizeText(booking.external_reservation_id || ''))
          .filter(Boolean),
      );

      const resortUnitMap = new Map(
        units
          .filter((unit: any) => (unit.name || unit.unit_name || '').trim())
          .map((unit: any) => [normalizeRoomName(unit.name || unit.unit_name || ''), unit]),
      );
      const displayUnitMap = new Map(
        displayUnits
          .filter((unit) => (unit.unit_name || '').trim())
          .map((unit) => [normalizeRoomName(unit.unit_name || ''), unit]),
      );
      const guestMap = new Map(
        guests
          .filter((guest: any) => (guest.full_name || '').trim())
          .map((guest: any) => [normalizeText(guest.full_name), guest]),
      );
      const roomTypeMap = new Map(
        roomTypes
          .filter((roomType) => (roomType.name || '').trim())
          .map((roomType) => [normalizeText(roomType.name), roomType.id]),
      );

      let imported = 0;
      let importedRows = 0;
      let skipped = rows.length - selectedRows.length;
      const errors: string[] = [];

      for (const row of selectedRows) {
        const externalIdKey = normalizeText(row.externalReservationId);
        if (externalIdKey && existingDuplicateIds.has(externalIdKey)) {
          skipped += 1;
          errors.push(`Row ${row.idx}: Duplicate reservation already exists and was skipped`);
          continue;
        }

        try {
          let guest = guestMap.get(normalizeText(row.guestName));

          if (!guest) {
            const { data: newGuest, error: guestError } = await from('resort_ops_guests')
              .insert({
                full_name: row.guestName,
                email: row.email || null,
                phone: row.phone || null,
              })
              .select('id, full_name, email, phone')
              .single();

            if (guestError || !newGuest) throw new Error(guestError?.message || 'Failed to create guest');
            guest = newGuest;
            guestMap.set(normalizeText(row.guestName), guest);
          } else {
            const guestPatch: Record<string, string> = {};
            if (row.email && row.email !== guest.email) guestPatch.email = row.email;
            if (row.phone && row.phone !== guest.phone) guestPatch.phone = row.phone;

            if (Object.keys(guestPatch).length > 0) {
              const { data: updatedGuest, error: guestUpdateError } = await from('resort_ops_guests')
                .update(guestPatch)
                .eq('id', guest.id)
                .select('id, full_name, email, phone')
                .single();

              if (!guestUpdateError && updatedGuest) {
                guest = updatedGuest;
                guestMap.set(normalizeText(row.guestName), guest);
              }
            }
          }

          const roomTypeId = row.roomType ? roomTypeMap.get(normalizeText(row.roomType)) ?? null : null;
          const roomCount = Math.max(row.roomNumbers.length, 1);
          const roomRate = deriveNightlyRate(row);
          const paidPerRoom = row.amountPaid > 0 ? row.amountPaid / roomCount : 0;
          const shouldMarkImportedStayOccupied = shouldSyncImportedRoomAsOccupied(row.checkIn, row.checkOut);

          let insertedForRow = 0;

          for (const roomName of row.roomNumbers) {
            const normalizedRoom = normalizeRoomName(roomName);
            let resortUnit = resortUnitMap.get(normalizedRoom);

            if (!resortUnit) {
              const { data: newResortUnit, error: resortUnitError } = await from('resort_ops_units')
                .insert({
                  name: roomName,
                  type: row.roomType || '',
                  base_price: roomRate || 0,
                  capacity: Math.max(row.adults + row.children, 2),
                })
                .select('*')
                .single();

              if (resortUnitError || !newResortUnit) throw new Error(resortUnitError?.message || `Failed to create operational room ${roomName}`);
              resortUnit = newResortUnit;
              resortUnitMap.set(normalizedRoom, resortUnit);
            }

            let displayUnit = displayUnitMap.get(normalizedRoom);
            if (!displayUnit) {
              const unitInsert: Record<string, any> = {
                unit_name: roomName,
                status: shouldMarkImportedStayOccupied ? 'occupied' : 'ready',
                active: true,
              };
              if (roomTypeId) unitInsert.room_type_id = roomTypeId;

              const { data: newDisplayUnit, error: displayUnitError } = await supabase
                .from('units')
                .insert(unitInsert as any)
                .select('id, unit_name, status, room_type_id, active')
                .single();

              if (displayUnitError || !newDisplayUnit) throw new Error(displayUnitError?.message || `Failed to create room ${roomName}`);
              displayUnit = newDisplayUnit;
              displayUnitMap.set(normalizedRoom, displayUnit);
            } else {
              const unitPatch: Record<string, any> = {};
              if (roomTypeId && !displayUnit.room_type_id) unitPatch.room_type_id = roomTypeId;
              if (shouldMarkImportedStayOccupied && displayUnit.status !== 'occupied') unitPatch.status = 'occupied';
              if (displayUnit.active === false) unitPatch.active = true;

              if (Object.keys(unitPatch).length > 0) {
                const { data: updatedUnit, error: displayUnitUpdateError } = await supabase
                  .from('units')
                  .update(unitPatch as any)
                  .eq('id', displayUnit.id)
                  .select('id, unit_name, status, room_type_id, active')
                  .single();

                if (displayUnitUpdateError) throw new Error(displayUnitUpdateError.message);
                if (updatedUnit) {
                  displayUnit = updatedUnit;
                  displayUnitMap.set(normalizedRoom, displayUnit);
                }
              }
            }

            const externalData = {
              ...row.raw,
              imported_room_name: roomName,
              reservation_number: row.reservationNumber || null,
              third_party_confirmation: row.thirdPartyConfirmation || null,
              accommodation_total: row.accommodationTotal || null,
              amount_paid: row.amountPaid || null,
              grand_total: row.grandTotal || null,
              deposit: row.deposit || null,
              balance_due: row.balanceDue || null,
              reservation_date: row.reservationDate || null,
              country: row.country || null,
              room_type: row.roomType || null,
              status: row.status || null,
              source: row.source || null,
            };

            const { error: bookingError } = await from('resort_ops_bookings').insert({
              guest_id: guest.id,
              unit_id: resortUnit.id,
              platform: row.platform,
              source: row.source || null,
              external_reservation_id: row.externalReservationId || null,
              external_data: externalData,
              check_in: row.checkIn,
              check_out: row.checkOut,
              adults: Math.max(row.adults, 1),
              children: Math.max(row.children, 0),
              room_rate: roomRate || 0,
              paid_amount: paidPerRoom || 0,
              notes: buildBookingNotes(row, roomName) || null,
            });

            if (bookingError) throw new Error(bookingError.message);
            imported += 1;
            insertedForRow += 1;
          }

          if (insertedForRow > 0) {
            importedRows += 1;
            if (externalIdKey) existingDuplicateIds.add(externalIdKey);
          } else {
            skipped += 1;
            errors.push(`Row ${row.idx}: No reservations were imported`);
          }
        } catch (error: any) {
          skipped += 1;
          errors.push(`Row ${row.idx}: ${error?.message || 'Import failed'}`);
        }
      }

      setResult({ imported, importedRows, skipped, errors });

      if (imported > 0) {
        onComplete();
        QUERY_KEYS_TO_INVALIDATE.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
        toast.success(`Imported ${imported} reservation${imported !== 1 ? 's' : ''}`);
      } else {
        toast.error('No reservations were imported');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setRows([]);
    setResult(null);
    setShowOnlyIssues(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const validSelected = rows.filter((row) => row.selected && row.errors.length === 0).length;
  const issueRows = rows.filter((row) => row.errors.length > 0);
  const validRows = rows.filter((row) => row.errors.length === 0);
  const previewValidRows = showOnlyIssues ? [] : validRows.slice(0, 8);
  const previewRows = showOnlyIssues ? issueRows : [...issueRows, ...previewValidRows];
  const extraCount = showOnlyIssues ? Math.max(rows.length - issueRows.length, 0) : Math.max(validRows.length - previewValidRows.length, 0);
  const validRowCount = validRows.length;
  const invalidRowCount = issueRows.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-sm tracking-wider">Import Reservations</DialogTitle>
          <DialogDescription className="font-body text-xs text-muted-foreground">
            Upload the simplified template or a Cloudbeds export CSV. Dates must use dd/mm/yyyy.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="font-body text-sm font-medium text-foreground">
                  {result.imported} reservation{result.imported !== 1 ? 's' : ''} imported
                </span>
              </div>
              <p className="font-body text-xs text-muted-foreground">
                {result.importedRows} row{result.importedRows !== 1 ? 's' : ''} imported · {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped
              </p>
              {result.errors.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {result.errors.map((error, index) => (
                    <div key={`${error}-${index}`} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="font-body text-xs text-destructive">{error}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => handleClose(false)} className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded border border-border bg-muted/30 p-3 space-y-1">
              <p className="font-body text-xs font-medium text-foreground">Supported CSV shapes</p>
              <p className="font-body text-xs text-muted-foreground">
                Simplified template download and Cloudbeds exports with extra guest or document columns.
              </p>
            </div>

            <Button size="sm" variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-1" /> Download CSV Template
            </Button>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              <FileText className="w-8 h-8 text-muted-foreground mb-2" />
              <span className="font-body text-sm text-muted-foreground">Click to upload CSV</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>

            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-body text-xs text-muted-foreground">
                    {rows.length} rows parsed · {invalidRowCount} with issues · {validRowCount} valid
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    onClick={() => toggleAll(rows.some((row) => !row.selected && row.errors.length === 0))}
                  >
                    {rows.filter((row) => row.selected).length === validRowCount ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>

                {invalidRowCount > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-muted/30 p-2.5">
                    <p className="font-body text-xs text-foreground">
                      {invalidRowCount} row{invalidRowCount !== 1 ? 's' : ''} need attention
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={showOnlyIssues ? 'secondary' : 'ghost'}
                        className="h-7 text-xs"
                        onClick={() => setShowOnlyIssues(true)}
                      >
                        Show only issues
                      </Button>
                      <Button
                        size="sm"
                        variant={!showOnlyIssues ? 'secondary' : 'ghost'}
                        className="h-7 text-xs"
                        onClick={() => setShowOnlyIssues(false)}
                      >
                        Show issues first
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[42vh] overflow-y-auto">
                  {previewRows.map((row) => (
                    <div
                      key={row.idx}
                      className={`p-3 rounded border space-y-1 ${row.errors.length > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-background'}`}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={row.selected}
                          disabled={row.errors.length > 0}
                          onCheckedChange={() => toggleRow(row.idx)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-body text-sm font-medium text-foreground">{row.guestName || '(no name)'}</p>
                            {row.status && (
                              <Badge variant={getStatusBadgeVariant(row.status)} className="text-[10px] h-5">
                                {row.status}
                              </Badge>
                            )}
                            {row.source && (
                              <Badge variant="secondary" className="text-[10px] h-5 max-w-full">
                                {row.source}
                              </Badge>
                            )}
                          </div>
                          <p className="font-body text-xs text-muted-foreground">
                            Rooms: {row.roomNumbers.join(', ') || row.roomNumber || '—'} · Adults: {row.adults} · Children: {row.children}
                          </p>
                          <p className="font-body text-xs text-muted-foreground">
                            {row.checkIn || '—'} → {row.checkOut || '—'}{row.nights > 0 ? ` · ${row.nights} night${row.nights !== 1 ? 's' : ''}` : ''}
                          </p>
                          <p className="font-body text-xs text-muted-foreground">
                            Accommodation: ₱{row.accommodationTotal.toLocaleString('en-PH', { maximumFractionDigits: 2 })} · Paid: ₱{row.amountPaid.toLocaleString('en-PH', { maximumFractionDigits: 2 })}
                            {row.deposit > 0 ? ` · Deposit: ₱${row.deposit.toLocaleString('en-PH', { maximumFractionDigits: 2 })}` : ''}
                          </p>
                          <p className="font-body text-xs text-muted-foreground">
                            Reservation #: {row.reservationNumber || '—'}{row.country ? ` · ${row.country}` : ''}
                          </p>
                          {(row.email || row.phone) && (
                            <p className="font-body text-xs text-muted-foreground">
                              {[row.email, row.phone].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {row.errors.map((error, index) => (
                            <p key={`${row.idx}-${index}`} className="font-body text-xs text-destructive">{error}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <p className="font-body text-xs text-muted-foreground text-center py-2">
                      {showOnlyIssues
                        ? `+ ${extraCount} valid row${extraCount !== 1 ? 's' : ''} hidden`
                        : `+ ${extraCount} more valid row${extraCount !== 1 ? 's' : ''} (all selected valid rows will be imported)`}
                    </p>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={doImport}
                  disabled={importing || validSelected === 0}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {importing ? 'Importing...' : `Import ${validSelected} Row${validSelected !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportReservationsModal;
