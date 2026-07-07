import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Upload, Trash2, Plus, Users, FileText, UtensilsCrossed, MapPin, StickyNote, Sparkles, LogIn, LogOut, Camera, Download, Link as LinkIcon, ClipboardCheck, DollarSign, Pencil, Clock, CalendarPlus, ArrowRightLeft, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInCalendarDays, addDays } from 'date-fns';
import VibeCheckInForm from './vibe/VibeCheckInForm';
import VibeDetailView from './vibe/VibeDetailView';
import HousekeepingInspection from './HousekeepingInspection';
import RoomBillingTab from '@/components/rooms/RoomBillingTab';
import EditGuestModal from '@/components/rooms/EditGuestModal';
import EditTourModal from '@/components/rooms/EditTourModal';
import GuestActivityTimeline from '@/components/rooms/GuestActivityTimeline';
import ClosedCheckoutsPanel from '@/components/rooms/ClosedCheckoutsPanel';
import { compressImage } from '@/lib/imageCompress';
import { getManilaDateKey, resolveOperationalUnitWorkflow } from '@/lib/receptionOccupancy';

const from = (table: string) => supabase.from(table as any) as any;

type DetailTab = 'info' | 'orders' | 'documents' | 'notes' | 'tours' | 'vibe' | 'billing' | 'timeline';

interface RoomsDashboardProps {
  readOnly?: boolean;
  canViewDocuments?: boolean;
  initialUnit?: any;
  singleUnitMode?: boolean;
  onClose?: () => void;
}

const NOTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'guest_preference', label: 'Preference' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'staff_note', label: 'Staff Note' },
];

const DOC_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'government_id', label: 'Government ID' },
  { value: 'driver_license', label: 'Driver License' },
  { value: 'id_card', label: 'ID Card' },
  { value: 'waiver', label: 'Waiver' },
  { value: 'contract', label: 'Contract' },
  { value: 'booking_confirmation', label: 'Booking Confirmation' },
  { value: 'other', label: 'Other' },
];

const RoomsDashboard = ({ readOnly = false, canViewDocuments = true, initialUnit, singleUnitMode = false, onClose }: RoomsDashboardProps) => {
  const qc = useQueryClient();
  const [selectedUnit, setSelectedUnit] = useState<any>(initialUnit || null);
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [vibeMode, setVibeMode] = useState<'list' | 'form' | 'detail'>('list');
  const [editingVibeRecord, setEditingVibeRecord] = useState<any>(null);
  const [viewingVibeRecord, setViewingVibeRecord] = useState<any>(null);
  const [viewingHousekeepingOrder, setViewingHousekeepingOrder] = useState<any>(null);

  // Modals
  const [showEditGuest, setShowEditGuest] = useState(false);
  const [editingTour, setEditingTour] = useState<any>(null);
  const [showExtendStay, setShowExtendStay] = useState(false);
  const [showChangeRoom, setShowChangeRoom] = useState(false);
  const [extendDate, setExtendDate] = useState('');
  const [changeRoomId, setChangeRoomId] = useState('');

  // Check-in form state
  const [checkInForm, setCheckInForm] = useState({
    guestName: '', phone: '', email: '',
    checkIn: new Date().toISOString().split('T')[0],
    checkOut: '', adults: '1', children: '0', platform: 'Hotel Guest', roomRate: '0', notes: '', specialRequests: '',
  });
  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckInForm, setShowCheckInForm] = useState(false);
  const [guestSearchResults, setGuestSearchResults] = useState<any[]>([]);
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  // Document form state
  const [docType, setDocType] = useState('passport');
  const [docNotes, setDocNotes] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Tour form state
  const [tourName, setTourName] = useState('');
  const [tourDate, setTourDate] = useState('');
  const [tourPax, setTourPax] = useState('1');
  const [tourPrice, setTourPrice] = useState('');
  const [tourProvider, setTourProvider] = useState('');
  const [tourPickupTime, setTourPickupTime] = useState('');
  const [tourNotes, setTourNotes] = useState('');
  const [tourCatalogMode, setTourCatalogMode] = useState<'catalog' | 'other'>('catalog');

  // Note form
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [noteImageUrl, setNoteImageUrl] = useState('');
  const [showNoteUrl, setShowNoteUrl] = useState(false);
  const noteTextRef = useRef<HTMLTextAreaElement>(null);

  // Room types (for base rates)
  const { data: roomTypes = [] } = useQuery({
    queryKey: ['room-types'],
    queryFn: async () => {
      const { data } = await supabase.from('room_types').select('*').order('name');
      return (data || []) as any[];
    },
  });

  // Units
  const { data: units = [] } = useQuery({
    queryKey: ['rooms-units'],
    queryFn: async () => {
      const { data } = await supabase.from('units').select('*').eq('active', true).order('unit_name');
      return (data || []).map((u: any) => ({ ...u, name: u.unit_name, type: '', capacity: 0 }));
    },
  });

  // All guests for combo search
  const { data: allGuests = [] } = useQuery({
    queryKey: ['all-guests'],
    queryFn: async () => {
      const { data } = await from('resort_ops_guests').select('*').order('full_name');
      return (data || []) as any[];
    },
  });

  // Resort ops units (for booking linkage)
  const { data: resortUnits = [] } = useQuery({
    queryKey: ['resort-ops-units'],
    queryFn: async () => {
      const { data } = await from('resort_ops_units').select('*');
      return (data || []) as any[];
    },
  });

  // Bookings (current)
  const { data: bookings = [] } = useQuery({
    queryKey: ['rooms-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('resort_ops_bookings').select('*, resort_ops_guests(*)').order('check_in', { ascending: false });
      return data || [];
    },
  });

  // All vibe records (for grid view badges)
  const { data: vibeRecords = [] } = useQuery({
    queryKey: ['vibe-records'],
    queryFn: async () => {
      const { data } = await from('guest_vibe_records')
        .select('*').eq('checked_out', false).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Housekeeping orders (active)
  const { data: housekeepingOrders = [] } = useQuery({
    queryKey: ['housekeeping-orders'],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders')
        .select('*').neq('status', 'completed').order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Employees for housekeeper names
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name, display_name').eq('active', true).order('name');
      return data || [];
    },
  });

  // Catalog data for tour dropdown
  const { data: toursConfig = [] } = useQuery({
    queryKey: ['tours-config-catalog'],
    queryFn: async () => {
      const { data } = await supabase.from('tours_config').select('*').eq('active', true).order('sort_order');
      return (data || []) as any[];
    },
  });
  const { data: rentalRates = [] } = useQuery({
    queryKey: ['rental-rates-catalog'],
    queryFn: async () => {
      const { data } = await supabase.from('rental_rates').select('*').eq('active', true).order('sort_order');
      return (data || []) as any[];
    },
  });
  const { data: transportRates = [] } = useQuery({
    queryKey: ['transport-rates-catalog'],
    queryFn: async () => {
      const { data } = await supabase.from('transport_rates').select('*').eq('active', true).order('sort_order');
      return (data || []) as any[];
    },
  });

  // Resolve resort_ops_unit for a room name
  const resolveResortUnit = (roomName: string) => {
    return resortUnits.find((ru: any) => ru.name.toLowerCase().trim() === roomName.toLowerCase().trim());
  };

  const today = getManilaDateKey();

  const getUnitWorkflow = (unit: any) => {
    const resortUnit = resolveResortUnit(unit.name);
    const unitBookings = resortUnit
      ? bookings.filter((b: any) => b.unit_id === resortUnit.id)
      : [];

    return resolveOperationalUnitWorkflow({
      bookings: unitBookings,
      rawStatus: unit.status,
      today,
    });
  };

  // Get unit status
  const getUnitStatus = (unit: any): 'occupied' | 'to_clean' | 'ready' => getUnitWorkflow(unit).displayStatus;

  // Active booking
  const getActiveBooking = (unit: any) => getUnitWorkflow(unit).activeBooking;

  const currentBooking = getActiveBooking(selectedUnit);
  const guestId = (currentBooking as any)?.guest_id;

  // Orders for selected unit
  const { data: unitOrders = [] } = useQuery({
    queryKey: ['rooms-orders', selectedUnit?.name, currentBooking?.id],
    enabled: !!selectedUnit && !!currentBooking,
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*')
        .eq('order_type', 'Room')
        .eq('location_detail', selectedUnit!.name)
        .gte('created_at', currentBooking!.check_in + 'T00:00:00')
        .lte('created_at', currentBooking!.check_out + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Documents
  const { data: documents = [] } = useQuery({
    queryKey: ['guest-documents', selectedUnit?.name, guestId],
    enabled: !!selectedUnit && !!guestId,
    queryFn: async () => {
      const { data } = await from('guest_documents').select('*').eq('unit_name', selectedUnit!.name).eq('guest_id', guestId).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest notes
  const { data: notes = [] } = useQuery({
    queryKey: ['guest-notes', selectedUnit?.name, currentBooking?.id],
    enabled: !!selectedUnit && !!currentBooking,
    queryFn: async () => {
      const { data } = await from('guest_notes').select('*').eq('booking_id', currentBooking!.id).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  // Guest tours
  const { data: tours = [] } = useQuery({
    queryKey: ['guest-tours', selectedUnit?.name, currentBooking?.id],
    enabled: !!selectedUnit && !!currentBooking,
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*').eq('booking_id', currentBooking!.id).order('tour_date');
      return (data || []) as any[];
    },
  });

  const unitVibeRecords = vibeRecords.filter((v: any) => v.unit_name === selectedUnit?.name);

  const getEmployeeName = (id: string) => {
    const emp = employees.find((e: any) => e.id === id);
    return emp ? (emp.display_name || emp.name) : '';
  };

  // --- STATUS LABELS ---
  const getGuestStatusLabels = (booking: any) => {
    if (!booking) return [];
    const labels: { text: string; color: string }[] = [];
    labels.push({ text: 'Checked In', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' });
    const platform = booking.platform || '';
    if (platform === 'Friends & Family') {
      labels.push({ text: '👨‍👩‍👧 F&F', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' });
    }
    const stayDays = differenceInCalendarDays(new Date(booking.check_out + 'T00:00:00'), new Date(booking.check_in + 'T00:00:00'));
    if (stayDays >= 7) {
      labels.push({ text: 'Long Stay', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' });
    }
    if ((booking.notes || '').includes('[VIP]')) {
      labels.push({ text: '⭐ VIP', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' });
    }
    // Problem Guest from vibe records
    const unitVibes = vibeRecords.filter((v: any) => v.unit_name === selectedUnit?.name && !v.checked_out);
    if (unitVibes.some((v: any) => (v.review_risk_level || []).includes('High'))) {
      labels.push({ text: '⚠ Problem', color: 'bg-destructive/20 text-destructive border-destructive/40' });
    }
    return labels;
  };

  const addNote = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!noteContent.trim() && !noteImageUrl.trim()) return;
    if (!selectedUnit) return;
    const content = noteImageUrl.trim() ? `[IMAGE]:${noteImageUrl.trim()}` : noteContent.trim();
    await from('guest_notes').insert({
      booking_id: currentBooking?.id || null,
      unit_name: selectedUnit.name,
      note_type: noteType,
      content,
      created_by: localStorage.getItem('emp_name') || 'admin',
    });
    setNoteContent(''); setNoteImageUrl(''); setShowNoteUrl(false);
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit.name, currentBooking?.id] });
    toast.success('Note added');
  };

  const uploadNoteImage = async (file: File) => {
    if (readOnly || !selectedUnit) return;
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop();
    const path = `notes/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('guest-documents').upload(path, compressed);
    if (error) { toast.error('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('guest-documents').getPublicUrl(path);
    await from('guest_notes').insert({
      booking_id: currentBooking?.id || null,
      unit_name: selectedUnit.name,
      note_type: noteType,
      content: `[IMAGE]:${urlData.publicUrl}`,
      created_by: localStorage.getItem('emp_name') || 'admin',
    });
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit.name, currentBooking?.id] });
    toast.success('Photo note added');
  };

  const deleteNote = async (id: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_notes').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-notes', selectedUnit?.name, currentBooking?.id] });
    toast.success('Note deleted');
  };

  const addTour = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!tourName.trim() || !tourDate || !selectedUnit) return;
    const tourData = {
      booking_id: currentBooking?.id || null,
      unit_name: selectedUnit.name,
      tour_name: tourName.trim(),
      tour_date: tourDate,
      pax: parseInt(tourPax) || 1,
      price: parseFloat(tourPrice) || 0,
      provider: tourProvider.trim(),
      pickup_time: tourPickupTime.trim(),
      notes: tourNotes.trim(),
    };
    await from('guest_tours').insert(tourData);

    // Sync to tour_bookings so it appears on /service/tours board
    const staffName = localStorage.getItem('emp_name') || '';
    await (supabase.from('tour_bookings') as any).insert({
      booking_id: currentBooking?.id || null,
      room_id: selectedUnit.id || null,
      guest_name: currentBooking?.resort_ops_guests?.full_name || selectedUnit.name,
      tour_name: tourData.tour_name,
      tour_date: tourData.tour_date,
      pax: tourData.pax,
      price: tourData.price,
      pickup_time: tourData.pickup_time,
      notes: tourData.notes,
      status: 'confirmed',
      confirmed_by: staffName,
    });

    import('@/lib/telegram').then(({ notifyTelegram }) => {
      notifyTelegram('tours,managers', `🚐 New Booking\n${currentBooking?.resort_ops_guests?.full_name || selectedUnit.name}\n${tourName.trim()} - ${tourDate}${tourPickupTime.trim() ? ' ' + tourPickupTime.trim() : ''}`);
    });
    setTourName(''); setTourDate(''); setTourPax('1'); setTourPrice('');
    setTourProvider(''); setTourPickupTime(''); setTourNotes('');
    setTourCatalogMode('catalog');
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit.name, currentBooking?.id] });
    qc.invalidateQueries({ queryKey: ['tours-board'] });
    toast.success('Tour added');
  };

  const updateTourStatus = async (id: string, status: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_tours').update({ status }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit?.name, currentBooking?.id] });
    toast.success('Tour updated');
  };

  const deleteTour = async (id: string) => {
    if (readOnly) { toast.error('View-only access'); return; }
    await from('guest_tours').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['guest-tours', selectedUnit?.name, currentBooking?.id] });
    toast.success('Tour deleted');
  };

  // Document upload with compression
  const uploadDocument = async (file: File) => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!selectedUnit) return;
    const compressed = file.type.startsWith('image/') ? await compressImage(file) : file;
    const ext = compressed.name.split('.').pop();
    const folder = guestId || selectedUnit.name.replace(/\s+/g, '_');
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('guest-documents').upload(path, compressed);
    if (error) { toast.error('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('guest-documents').getPublicUrl(path);
    await from('guest_documents').insert({
      guest_id: guestId || null,
      unit_name: selectedUnit.name,
      document_type: docType,
      image_url: urlData.publicUrl,
      notes: docNotes.trim() || null,
    });
    setDocNotes('');
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit.name, guestId] });
    toast.success('Document uploaded');
  };

  const addDocumentUrl = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!docUrl.trim() || !selectedUnit) return;
    await from('guest_documents').insert({
      guest_id: guestId || null,
      unit_name: selectedUnit.name,
      document_type: docType,
      image_url: docUrl.trim(),
      notes: docNotes.trim() || null,
    });
    setDocUrl(''); setDocNotes(''); setShowUrlInput(false);
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit.name, guestId] });
    toast.success('Document link added');
  };

  const deleteDocument = async (doc: any) => {
    if (readOnly) { toast.error('View-only access'); return; }
    const path = doc.image_url.split('/guest-documents/')[1];
    if (path && !doc.image_url.startsWith('http://') && !doc.image_url.includes('//') === false) {
      await supabase.storage.from('guest-documents').remove([path]);
    }
    await from('guest_documents').delete().eq('id', doc.id);
    qc.invalidateQueries({ queryKey: ['guest-documents', selectedUnit?.name, guestId] });
    toast.success('Document deleted');
  };

  const getUnitGuest = (unitName: string) => {
    const unit = units.find((u: any) => u.name === unitName);
    return unit ? getUnitWorkflow(unit).activeBooking : null;
  };

  const getTodayArrivalBooking = (unit: any) => getUnitWorkflow(unit).pendingArrival;

  const getTodayDepartureBooking = (unit: any) => getUnitWorkflow(unit).pendingDeparture;

  const getUnitVibeRisk = (unitName: string) => {
    const records = vibeRecords.filter((v: any) => v.unit_name === unitName && !v.checked_out);
    return records.some((v: any) => (v.review_risk_level || []).includes('High'));
  };

  const getHousekeepingOrder = (unitName: string) => {
    return housekeepingOrders.find((o: any) => o.unit_name === unitName);
  };

  // Upcoming booking for Ready rooms (next 7 days)
  const getUpcomingBooking = (unit: any) => {
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = addDays(new Date(), 6).toISOString().split('T')[0];
    const resortUnit = resolveResortUnit(unit.name);
    if (!resortUnit) return null;
    return bookings.find((b: any) => b.unit_id === resortUnit.id && b.check_in > today && b.check_in <= weekEnd) || null;
  };

  // --- CHECK-IN ---
  const handleCheckIn = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!selectedUnit || !checkInForm.guestName.trim() || !checkInForm.checkOut) {
      toast.error('Guest name and check-out date are required'); return;
    }
    if (getUnitStatus(selectedUnit) === 'to_clean') {
      toast.error('Complete housekeeping before check-in'); return;
    }
    if (checkInForm.checkOut <= checkInForm.checkIn) {
      toast.error('Check-out must be after check-in'); return;
    }
    // Conflict check: ensure no overlapping booking for this unit
    const resortUnitForCheck = resolveResortUnit(selectedUnit.name);
    if (resortUnitForCheck) {
      const conflicting = (bookings as any[]).find((b: any) =>
        b.unit_id === resortUnitForCheck.id &&
        b.check_in < checkInForm.checkOut &&
        b.check_out > checkInForm.checkIn
      );
      if (conflicting) {
        const conflictGuest = conflicting.resort_ops_guests?.full_name || conflicting.platform || 'another guest';
        toast.error(`Double booking! ${selectedUnit.name} is already booked by ${conflictGuest} (${conflicting.check_in} to ${conflicting.check_out}). Delete that booking first or pick another room.`);
        setCheckingIn(false);
        return;
      }
    }
    setCheckingIn(true);
    try {
      const { data: existingGuest } = await from('resort_ops_guests')
        .select('id').ilike('full_name', checkInForm.guestName.trim()).maybeSingle() as any;
      let gId: string;
      if (existingGuest) {
        gId = existingGuest.id;
        await from('resort_ops_guests').update({ phone: checkInForm.phone || null, email: checkInForm.email || null }).eq('id', gId);
      } else {
        const { data: newGuest, error: gErr } = await from('resort_ops_guests').insert({
          full_name: checkInForm.guestName.trim(), phone: checkInForm.phone || null, email: checkInForm.email || null,
        }).select('id').single() as any;
        if (gErr || !newGuest) throw new Error('Failed to create guest');
        gId = newGuest.id;
      }
      let resortUnit = resolveResortUnit(selectedUnit.name);
      if (!resortUnit) {
        const { data: newUnit, error: uErr } = await from('resort_ops_units').insert({
          name: selectedUnit.name, type: 'room', capacity: 2,
        }).select('id').single() as any;
        if (uErr || !newUnit) throw new Error('Failed to create unit mapping');
        resortUnit = { id: newUnit.id };
        qc.invalidateQueries({ queryKey: ['resort-ops-units'] });
      }
      const roomPassword = checkInForm.guestName.trim().split(' ').pop()?.toLowerCase() || 'guest';
      const expiresAt = new Date(checkInForm.checkOut);
      expiresAt.setDate(expiresAt.getDate() + 1);
      const { error: bErr } = await from('resort_ops_bookings').insert({
        guest_id: gId, unit_id: resortUnit.id, platform: checkInForm.platform,
        check_in: checkInForm.checkIn, check_out: checkInForm.checkOut,
        checked_in_at: new Date().toISOString(),
        adults: parseInt(checkInForm.adults) || 1, children: parseInt(checkInForm.children) || 0,
        room_rate: parseFloat(checkInForm.roomRate) || 0, notes: checkInForm.notes || '',
        special_requests: checkInForm.specialRequests || '',
        room_password: roomPassword, password_expires_at: expiresAt.toISOString(),
      });
      if (bErr) throw new Error(bErr.message);
      await supabase.from('units').update({ status: 'occupied' } as any).eq('id', selectedUnit.id);
      qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
      qc.invalidateQueries({ queryKey: ['rooms-units'] });
      setShowCheckInForm(false);
      setCheckInForm({
        guestName: '', phone: '', email: '',
        checkIn: new Date().toISOString().split('T')[0],
        checkOut: '', adults: '1', children: '0', platform: 'Hotel Guest', roomRate: '0', notes: '', specialRequests: '',
      });
      toast.success(`${checkInForm.guestName.trim()} checked in to ${selectedUnit.name}. Room password: ${roomPassword}`, { duration: 10000 });
    } catch (err: any) {
      toast.error(err.message || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  // --- CHECK-OUT ---
  const handleCheckOut = async () => {
    if (readOnly) { toast.error('View-only access'); return; }
    if (!currentBooking) return;
    const today = new Date().toISOString().split('T')[0];
    const { error } = await from('resort_ops_bookings').update({
      check_out: today,
      checked_out_at: new Date().toISOString(),
    }).eq('id', currentBooking.id);
    if (error) { toast.error('Checkout failed'); return; }
    await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', selectedUnit.id);
    const existingOrder = housekeepingOrders.find((o: any) => o.unit_name === selectedUnit.name);
    if (!existingOrder) {
      await from('housekeeping_orders').insert({
        unit_name: selectedUnit.name,
        room_type_id: (selectedUnit as any).room_type_id || null,
        status: 'pending_inspection',
      });
    }
    qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
    qc.invalidateQueries({ queryKey: ['rooms-units'] });
    qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
    toast.success('Guest checked out — housekeeping order created');
  };

  // --- EXTEND STAY ---
  const handleExtendStay = async () => {
    if (!currentBooking || !extendDate) return;
    if (extendDate <= currentBooking.check_out) { toast.error('New date must be after current check-out'); return; }
    await from('resort_ops_bookings').update({ check_out: extendDate }).eq('id', currentBooking.id);
    qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
    setShowExtendStay(false);
    toast.success(`Stay extended to ${format(new Date(extendDate + 'T00:00:00'), 'MMM d, yyyy')}`);
  };

  // --- CHANGE ROOM ---
  const handleChangeRoom = async () => {
    if (!currentBooking || !changeRoomId) return;
    const newUnit = units.find((u: any) => u.id === changeRoomId);
    if (!newUnit) return;
    const newResortUnit = resolveResortUnit(newUnit.name);
    if (!newResortUnit) { toast.error('Target room not found in resort ops'); return; }
    await from('resort_ops_bookings').update({ unit_id: newResortUnit.id }).eq('id', currentBooking.id);
    // Old unit → to_clean, new unit → occupied
    await supabase.from('units').update({ status: 'to_clean' } as any).eq('id', selectedUnit.id);
    await supabase.from('units').update({ status: 'occupied' } as any).eq('id', changeRoomId);
    qc.invalidateQueries({ queryKey: ['rooms-bookings'] });
    qc.invalidateQueries({ queryKey: ['rooms-units'] });
    setShowChangeRoom(false);
    setSelectedUnit(newUnit);
    toast.success(`Guest moved to ${newUnit.name}`);
  };

  // ── HOUSEKEEPING INSPECTION VIEW ──
  if (viewingHousekeepingOrder) {
    const hkMode = viewingHousekeepingOrder.status === 'pre_inspection' ? 'pre_inspection' : 'cleaning';
    return (
      <HousekeepingInspection
        order={viewingHousekeepingOrder}
        mode={hkMode}
        onClose={() => {
          setViewingHousekeepingOrder(null);
          qc.invalidateQueries({ queryKey: ['housekeeping-orders'] });
          qc.invalidateQueries({ queryKey: ['rooms-units'] });
          qc.invalidateQueries({ queryKey: ['checkout-hk-clearance'] });
        }}
      />
    );
  }

  // DETAIL VIEW
  if (selectedUnit) {
    const booking = getActiveBooking(selectedUnit);
    const guest = (booking as any)?.resort_ops_guests;
    const unitHkOrder = getHousekeepingOrder(selectedUnit.name);
    const statusLabels = getGuestStatusLabels(booking);
    const readyUnitsForChange = units.filter((u: any) => getUnitStatus(u) === 'ready' && u.id !== selectedUnit.id);

    // Vibe sub-views
    if (detailTab === 'vibe' && vibeMode === 'form') {
      return (
        <VibeCheckInForm
          unitName={selectedUnit.name}
          existingRecord={editingVibeRecord}
          onClose={() => { setVibeMode('list'); setEditingVibeRecord(null); }}
        />
      );
    }
    if (detailTab === 'vibe' && vibeMode === 'detail' && viewingVibeRecord) {
      return (
        <VibeDetailView
          record={viewingVibeRecord}
          onBack={() => { setVibeMode('list'); setViewingVibeRecord(null); }}
          onEdit={() => { setEditingVibeRecord(viewingVibeRecord); setVibeMode('form'); }}
        />
      );
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => { if (singleUnitMode && onClose) { onClose(); } else { setSelectedUnit(null); setShowCheckInForm(false); } }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h3 className="font-display text-lg tracking-wider text-foreground">{selectedUnit.name}</h3>
          <Badge variant={booking ? 'default' : 'secondary'} className="font-body text-xs">
            {booking ? 'Occupied' : getTodayArrivalBooking(selectedUnit) ? 'Arrival Today' : getUnitStatus(selectedUnit) === 'to_clean' ? 'To Clean' : 'Ready'}
          </Badge>
        </div>

        {/* Status labels (PART 9) */}
        {booking && statusLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {statusLabels.map(l => (
              <Badge key={l.text} variant="outline" className={`font-body text-xs ${l.color}`}>{l.text}</Badge>
            ))}
          </div>
        )}

        {/* Quick Action Bar (PART 8) */}
        {booking && !readOnly && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <Button size="sm" variant="outline" className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
              onClick={() => { setExtendDate(booking.check_out); setShowExtendStay(true); }}>
              <CalendarPlus className="w-3.5 h-3.5" /> Extend Stay
            </Button>
            {readyUnitsForChange.length > 0 && (
              <Button size="sm" variant="outline" className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
                onClick={() => setShowChangeRoom(true)}>
                <ArrowRightLeft className="w-3.5 h-3.5" /> Change Room
              </Button>
            )}
            <Button size="sm" variant="outline" className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
              onClick={() => setDetailTab('tours')}>
              <MapPin className="w-3.5 h-3.5" /> Add Tour
            </Button>
            <Button size="sm" variant="outline" className="font-display text-xs tracking-wider gap-1 min-h-[36px] whitespace-nowrap flex-shrink-0"
              onClick={() => { setDetailTab('notes'); setTimeout(() => noteTextRef.current?.focus(), 200); }}>
              <StickyNote className="w-3.5 h-3.5" /> Add Note
            </Button>
          </div>
        )}

        {/* Housekeeping banner */}
        {unitHkOrder && !readOnly && (() => {
          const s = unitHkOrder.status;
          const isCleared = s === 'inspection_cleared';
          const isPreInspect = s === 'pre_inspection';
          const isCleaning = s === 'cleaning';
          const borderColor = isCleared ? 'border-emerald-500/50' : 'border-amber-500/50';
          const bgColor = isCleared ? 'bg-emerald-500/10' : 'bg-amber-500/10';
          const textColor = isCleared ? 'text-emerald-400' : 'text-amber-400';
          const icon = isCleared ? '✅' : isPreInspect ? '🔍' : isCleaning ? '🧹' : '📋';
          const label = isCleared ? 'Cleared for Checkout' : isPreInspect ? 'Pre-Checkout Inspection Needed' : isCleaning ? 'Cleaning in Progress' : s === 'pending_inspection' ? 'Pending Inspection' : s;
          const clickable = !isCleared;

          const content = (
            <>
              <div className="flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <span className={`font-display text-sm ${textColor} tracking-wider`}>
                  {label}
                </span>
              </div>
              {unitHkOrder.assigned_to && (
                <p className="font-body text-xs text-muted-foreground mt-1">Assigned to: {getEmployeeName(unitHkOrder.assigned_to)}</p>
              )}
              {isCleared && unitHkOrder.damage_notes && (
                <p className="font-body text-xs text-muted-foreground mt-1">Notes: {unitHkOrder.damage_notes}</p>
              )}
              {clickable && <p className={`font-body text-xs ${textColor} opacity-70 mt-1`}>Tap to open →</p>}
            </>
          );

          return clickable ? (
            <button
              onClick={() => setViewingHousekeepingOrder(unitHkOrder)}
              className={`w-full border-2 ${borderColor} ${bgColor} rounded-lg p-3 text-left`}
            >
              {content}
            </button>
          ) : (
            <div className={`w-full border-2 ${borderColor} ${bgColor} rounded-lg p-3`}>
              {content}
            </div>
          );
        })()}
        {unitHkOrder && readOnly && (
          <div className="w-full border-2 border-amber-500/50 bg-amber-500/10 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-amber-400" />
              <span className="font-display text-sm text-amber-400 tracking-wider">
                Housekeeping: {unitHkOrder.status === 'inspection_cleared' ? '✅ Cleared' : unitHkOrder.status === 'pre_inspection' ? '🔍 Pre-Inspection' : unitHkOrder.status === 'cleaning' ? '🧹 Cleaning' : unitHkOrder.status}
              </span>
            </div>
            {unitHkOrder.assigned_to && (
              <p className="font-body text-xs text-muted-foreground mt-1">Assigned to: {getEmployeeName(unitHkOrder.assigned_to)}</p>
            )}
          </div>
        )}

        {/* Detail tabs */}
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'info' as DetailTab, label: 'Guest', icon: Users },
            { key: 'orders' as DetailTab, label: 'Orders', icon: UtensilsCrossed },
            ...(canViewDocuments ? [{ key: 'documents' as DetailTab, label: 'Docs', icon: FileText }] : []),
            { key: 'notes' as DetailTab, label: 'Notes', icon: StickyNote },
            { key: 'tours' as DetailTab, label: 'Tours', icon: MapPin },
            { key: 'timeline' as DetailTab, label: 'Timeline', icon: Clock },
            { key: 'vibe' as DetailTab, label: 'Vibe', icon: Sparkles },
            { key: 'billing' as DetailTab, label: 'Billing', icon: DollarSign },
          ]).map(({ key, label, icon: Icon }) => (
            <Button key={key} size="sm" variant={detailTab === key ? 'default' : 'outline'}
              onClick={() => { setDetailTab(key); if (key === 'vibe') setVibeMode('list'); }}
              className="font-display text-xs tracking-wider gap-1">
              <Icon className="w-3.5 h-3.5" /> {label}
            </Button>
          ))}
        </div>

        {/* GUEST INFO */}
        {detailTab === 'info' && (
          <div className="space-y-3">
            {booking ? (
              <>
                <div className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-display text-sm text-foreground">{guest?.full_name || 'Unknown Guest'}</p>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => setShowEditGuest(true)} className="min-h-[36px]">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  {/* Guest type badge */}
                  {booking.platform && (
                    <Badge variant="outline" className={`font-body text-xs ${booking.platform === 'Friends & Family' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : ''}`}>
                      {booking.platform}
                    </Badge>
                  )}
                  {guest?.email && <p className="font-body text-xs text-muted-foreground">Email: {guest.email}</p>}
                  {guest?.phone && <p className="font-body text-xs text-muted-foreground">Phone: {guest.phone}</p>}
                  <div className="flex gap-4 mt-2">
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Check-in</p>
                      <p className="font-body text-sm text-foreground">{format(new Date(booking.check_in + 'T00:00:00'), 'MMM d, yyyy')}</p>
                    </div>
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Check-out</p>
                      <p className="font-body text-sm text-foreground">{format(new Date(booking.check_out + 'T00:00:00'), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Adults</p>
                      <p className="font-body text-sm text-foreground">{booking.adults}</p>
                    </div>
                    {(booking as any).children > 0 && (
                      <div>
                        <p className="font-body text-xs text-muted-foreground">Children</p>
                        <p className="font-body text-sm text-foreground">{(booking as any).children}</p>
                      </div>
                    )}
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Rate</p>
                      <p className="font-body text-sm text-foreground">₱{Number(booking.room_rate).toLocaleString()}</p>
                    </div>
                  </div>
                  {(booking as any).room_password && (
                    <div className="mt-2 p-2 border border-primary/30 rounded bg-primary/5">
                      <p className="font-body text-xs text-muted-foreground">Guest Password (last name)</p>
                      <p className="font-display text-lg tracking-wider text-primary">{(booking as any).room_password}</p>
                    </div>
                  )}
                  {booking.notes && (
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Booking Notes</p>
                      <p className="font-body text-sm text-foreground">{(booking.notes || '').replace('[VIP]', '').trim()}</p>
                    </div>
                  )}
                  {(booking as any).special_requests && (
                    <div>
                      <p className="font-body text-xs text-muted-foreground">Special Requests</p>
                      <p className="font-body text-sm text-foreground">{(booking as any).special_requests}</p>
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <Button size="sm" variant="destructive" onClick={handleCheckOut}
                    className="w-full font-display text-xs tracking-wider min-h-[44px]">
                    <LogOut className="w-4 h-4 mr-2" /> Check Out Guest
                  </Button>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {!showCheckInForm ? (
                  <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-3">
                    <p className="font-body text-sm text-muted-foreground">No guest currently checked in</p>
                    {getUnitStatus(selectedUnit) === 'to_clean' ? (
                      <p className="font-body text-xs text-amber-400">Complete housekeeping before check-in.</p>
                    ) : !readOnly ? (
                      <>
                        <p className="font-body text-xs text-muted-foreground">Check in a guest to enable full room management.</p>
                        <Button size="sm" onClick={() => {
                          const rt = roomTypes.find((r: any) => r.id === selectedUnit?.room_type_id);
                          if (rt?.base_rate) setCheckInForm(prev => ({ ...prev, roomRate: String(rt.base_rate) }));
                          setShowCheckInForm(true);
                        }} className="font-display text-xs tracking-wider min-h-[44px]">
                          <LogIn className="w-4 h-4 mr-2" /> Check In Guest
                        </Button>
                      </>
                    ) : (
                      <p className="font-body text-xs text-muted-foreground">View-only access — cannot check in guests.</p>
                    )}
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <p className="font-display text-xs tracking-wider text-foreground uppercase">Check In Guest</p>
                    <div className="relative">
                      <Input value={checkInForm.guestName}
                        onChange={e => {
                          const val = e.target.value;
                          setCheckInForm(p => ({ ...p, guestName: val }));
                          if (val.length >= 2) {
                            const filtered = allGuests.filter((g: any) => g.full_name.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
                            setGuestSearchResults(filtered);
                            setShowGuestDropdown(true);
                          } else { setShowGuestDropdown(false); }
                        }}
                        onFocus={() => { if (checkInForm.guestName.length >= 2) setShowGuestDropdown(true); }}
                        onBlur={() => setTimeout(() => setShowGuestDropdown(false), 200)}
                        placeholder="Guest full name *" className="bg-secondary border-border text-foreground font-body text-sm" />
                      {showGuestDropdown && guestSearchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 border border-border rounded-lg bg-card shadow-lg max-h-40 overflow-y-auto">
                          {guestSearchResults.map((g: any) => (
                            <button key={g.id} type="button" onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setCheckInForm(p => ({ ...p, guestName: g.full_name, phone: g.phone || p.phone, email: g.email || p.email }));
                                setShowGuestDropdown(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors">
                              <p className="font-body text-sm text-foreground">{g.full_name}</p>
                              {(g.phone || g.email) && <p className="font-body text-[10px] text-muted-foreground">{g.phone} {g.email}</p>}
                            </button>
                          ))}
                          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowGuestDropdown(false)}
                            className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors border-t border-border">
                            <p className="font-body text-xs text-accent">+ Add "{checkInForm.guestName}" as new guest</p>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={checkInForm.phone} onChange={e => setCheckInForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone" className="bg-secondary border-border text-foreground font-body text-xs" />
                      <Input value={checkInForm.email} onChange={e => setCheckInForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="Email" className="bg-secondary border-border text-foreground font-body text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Check-in</label>
                        <Input type="date" value={checkInForm.checkIn} onChange={e => setCheckInForm(p => ({ ...p, checkIn: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Check-out *</label>
                        <Input type="date" value={checkInForm.checkOut} onChange={e => setCheckInForm(p => ({ ...p, checkOut: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Adults</label>
                        <Input type="number" value={checkInForm.adults} onChange={e => setCheckInForm(p => ({ ...p, adults: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Children</label>
                        <Input type="number" value={checkInForm.children} onChange={e => setCheckInForm(p => ({ ...p, children: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Guest Type</label>
                        <Select value={checkInForm.platform} onValueChange={v => setCheckInForm(p => ({ ...p, platform: v }))}>
                          <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Hotel Guest">Hotel Guest</SelectItem>
                            <SelectItem value="Walk-In Guest">Walk-In</SelectItem>
                            <SelectItem value="Friends & Family">F&F 👨‍👩‍👧</SelectItem>
                            <SelectItem value="Direct">Direct</SelectItem>
                            <SelectItem value="Airbnb">Airbnb</SelectItem>
                            <SelectItem value="Booking.com">Booking.com</SelectItem>
                            <SelectItem value="Agoda">Agoda</SelectItem>
                            <SelectItem value="Website">Website</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="font-body text-xs text-muted-foreground">Rate</label>
                        <Input type="number" value={checkInForm.roomRate} onChange={e => setCheckInForm(p => ({ ...p, roomRate: e.target.value }))}
                          className="bg-secondary border-border text-foreground font-body text-xs" />
                      </div>
                    </div>
                    <Textarea value={checkInForm.specialRequests} onChange={e => setCheckInForm(p => ({ ...p, specialRequests: e.target.value }))}
                      placeholder="Special requests (dietary, accessibility, etc.)"
                      className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
                    <Textarea value={checkInForm.notes} onChange={e => setCheckInForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notes (optional)" className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowCheckInForm(false)}
                        className="flex-1 font-display text-xs tracking-wider min-h-[44px]">Cancel</Button>
                      <Button size="sm" onClick={handleCheckIn} disabled={checkingIn}
                        className="flex-1 font-display text-xs tracking-wider min-h-[44px]">
                        {checkingIn ? 'Checking in...' : 'Check In'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {detailTab === 'orders' && (
          <div className="space-y-2">
            {unitOrders.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No orders for this room</p>
            ) : unitOrders.map((order: any) => (
              <div key={order.id} className="border border-border rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <Badge variant={order.status === 'Closed' ? 'secondary' : 'default'} className="font-body text-xs">{order.status}</Badge>
                  <span className="font-body text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d · h:mm a')}</span>
                </div>
                <div className="space-y-0.5">
                  {(order.items as any[]).map((item: any, i: number) => (
                    <p key={i} className="font-body text-xs text-foreground">
                      {item.qty || item.quantity}× {item.name} — ₱{(item.price * (item.qty || item.quantity)).toFixed(0)}
                    </p>
                  ))}
                </div>
                <p className="font-display text-xs text-foreground">Total: ₱{Number(order.total).toFixed(0)}</p>
              </div>
            ))}
          </div>
        )}

        {/* DOCUMENTS (PART 6 — expanded types) */}
        {detailTab === 'documents' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="bg-secondary border-border text-foreground font-body text-xs">
                    <SelectValue placeholder="Document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={docNotes} onChange={e => setDocNotes(e.target.value)}
                  placeholder="Notes (e.g., expires March 2027)" className="bg-secondary border-border text-foreground font-body text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 justify-center hover:bg-secondary/50 min-h-[44px]">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Take Photo</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadDocument(e.target.files[0]); }} />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 justify-center hover:bg-secondary/50 min-h-[44px]">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Upload File</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadDocument(e.target.files[0]); }} />
                  </label>
                </div>
                {!showUrlInput ? (
                  <Button size="sm" variant="outline" onClick={() => setShowUrlInput(true)}
                    className="w-full font-display text-xs tracking-wider min-h-[44px]">
                    <LinkIcon className="w-3.5 h-3.5 mr-1" /> Add Document Link
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Input value={docUrl} onChange={e => setDocUrl(e.target.value)}
                      placeholder="https://..." className="bg-secondary border-border text-foreground font-body text-xs flex-1" />
                    <Button size="sm" onClick={addDocumentUrl} disabled={!docUrl.trim()} className="font-display text-xs tracking-wider min-h-[44px]">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowUrlInput(false); setDocUrl(''); }}
                      className="font-display text-xs min-h-[44px]">✕</Button>
                  </div>
                )}
              </div>
            )}
            {documents.map((doc: any) => (
              <div key={doc.id} className="border border-border rounded-lg overflow-hidden">
                {doc.image_url && !doc.image_url.startsWith('http://') && doc.image_url.includes('guest-documents') ? (
                  <img src={doc.image_url} alt="Document" className="w-full max-h-64 object-contain bg-secondary" />
                ) : (
                  <div className="p-3 bg-secondary flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body text-xs text-foreground truncate">{doc.image_url}</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-body text-xs text-muted-foreground">
                      {doc.document_type?.replace('_', ' ')} · {format(new Date(doc.created_at), 'MMM d, yyyy')}
                    </span>
                    {doc.notes && <p className="font-body text-xs text-foreground mt-0.5 truncate">{doc.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <a href={doc.image_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost"><Download className="w-3.5 h-3.5 text-foreground" /></Button>
                    </a>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => deleteDocument(doc)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {documents.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No documents yet</p>}
          </div>
        )}

        {/* NOTES (PART 5 — enhanced) */}
        {detailTab === 'notes' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-32 bg-secondary border-border text-foreground font-body text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea ref={noteTextRef} value={noteContent} onChange={e => setNoteContent(e.target.value)}
                  placeholder="Add a note..." className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />

                {/* Attachment options */}
                <div className="flex gap-2 flex-wrap">
                  <label className="flex items-center gap-1 cursor-pointer border border-dashed border-border rounded-lg px-3 py-2 hover:bg-secondary/50">
                    <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Photo</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadNoteImage(e.target.files[0]); }} />
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer border border-dashed border-border rounded-lg px-3 py-2 hover:bg-secondary/50">
                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-body text-xs text-muted-foreground">Image</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) uploadNoteImage(e.target.files[0]); }} />
                  </label>
                  {!showNoteUrl ? (
                    <button onClick={() => setShowNoteUrl(true)}
                      className="flex items-center gap-1 border border-dashed border-border rounded-lg px-3 py-2 hover:bg-secondary/50">
                      <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-body text-xs text-muted-foreground">URL</span>
                    </button>
                  ) : (
                    <div className="flex gap-1 flex-1">
                      <Input value={noteImageUrl} onChange={e => setNoteImageUrl(e.target.value)}
                        placeholder="https://..." className="bg-secondary border-border text-foreground font-body text-xs flex-1 h-8" />
                      <Button size="sm" variant="ghost" onClick={() => { setShowNoteUrl(false); setNoteImageUrl(''); }}
                        className="h-8 px-2 text-xs">✕</Button>
                    </div>
                  )}
                </div>

                <Button size="sm" onClick={addNote} disabled={!noteContent.trim() && !noteImageUrl.trim()}
                  className="font-display text-xs tracking-wider w-full">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Note
                </Button>
              </div>
            )}
            {notes.map((note: any) => {
              const isImage = note.content?.startsWith('[IMAGE]:');
              const imageUrl = isImage ? note.content.replace('[IMAGE]:', '') : null;
              return (
                <div key={note.id} className="border border-border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className="font-body text-xs mb-1">{(note.note_type || 'general').replace('_', ' ')}</Badge>
                      {isImage ? (
                        <a href={imageUrl!} target="_blank" rel="noopener noreferrer">
                          <img src={imageUrl!} alt="Note attachment" className="max-h-40 rounded mt-1 object-contain bg-secondary" />
                        </a>
                      ) : (
                        <p className="font-body text-sm text-foreground">{note.content}</p>
                      )}
                      <p className="font-body text-xs text-muted-foreground mt-1">
                        {note.created_by} · {format(new Date(note.created_at), 'MMM d · h:mm a')}
                      </p>
                    </div>
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => deleteNote(note.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {notes.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No notes yet</p>}
          </div>
        )}

        {/* TOURS (PART 4 — editable) */}
        {detailTab === 'tours' && (
          <div className="space-y-3">
            {!readOnly && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                {/* Catalog dropdown or manual entry */}
                {tourCatalogMode === 'catalog' ? (
                  <Select onValueChange={(val) => {
                    if (val === '__other__') {
                      setTourCatalogMode('other');
                      setTourName(''); setTourPrice(''); setTourProvider('');
                      return;
                    }
                    // Parse selection: "type::name::price::provider"
                    const [, name, price, provider] = val.split('::');
                    setTourName(name || '');
                    setTourPrice(price || '0');
                    setTourProvider(provider || '');
                  }}>
                    <SelectTrigger className="bg-secondary border-border text-foreground font-body text-sm">
                      <SelectValue placeholder="Select tour / experience / rental *" />
                    </SelectTrigger>
                    <SelectContent>
                      {toursConfig.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="font-display text-xs tracking-wider text-muted-foreground">Tours & Experiences</SelectLabel>
                          {toursConfig.map((t: any) => (
                            <SelectItem key={t.id} value={`tour::${t.name}::${t.price}::${t.provider || ''}`}>
                              {t.name} — ₱{t.price}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {rentalRates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="font-display text-xs tracking-wider text-muted-foreground">Rentals</SelectLabel>
                          {rentalRates.map((r: any) => (
                            <SelectItem key={r.id} value={`rental::${r.rate_name}::${r.price}::${r.item_type || ''}`}>
                              {r.rate_name} — ₱{r.price}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {transportRates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="font-display text-xs tracking-wider text-muted-foreground">Transport</SelectLabel>
                          {transportRates.map((tr: any) => (
                            <SelectItem key={tr.id} value={`transport::${tr.type}::${tr.price}::`}>
                              {tr.type} — ₱{tr.price}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        <SelectItem value="__other__">✏️ Other (type manually)</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input value={tourName} onChange={e => setTourName(e.target.value)} placeholder="Tour name *"
                      className="bg-secondary border-border text-foreground font-body text-sm flex-1" />
                    <Button size="sm" variant="outline" onClick={() => setTourCatalogMode('catalog')}
                      className="font-body text-xs shrink-0">Catalog</Button>
                  </div>
                )}
                {tourName && (
                  <p className="font-body text-xs text-muted-foreground px-1">
                    Selected: <span className="text-foreground font-medium">{tourName}</span>
                    {tourPrice && <> · ₱{tourPrice}</>}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Input value={tourProvider} onChange={e => setTourProvider(e.target.value)} placeholder="Provider / vendor"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input type="date" value={tourDate} onChange={e => setTourDate(e.target.value)}
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" value={tourPax} onChange={e => setTourPax(e.target.value)} placeholder="Pax"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input type="number" value={tourPrice} onChange={e => setTourPrice(e.target.value)} placeholder="Price"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                  <Input value={tourPickupTime} onChange={e => setTourPickupTime(e.target.value)} placeholder="Pickup time"
                    className="bg-secondary border-border text-foreground font-body text-xs" />
                </div>
                <Input value={tourNotes} onChange={e => setTourNotes(e.target.value)} placeholder="Notes (optional)"
                  className="bg-secondary border-border text-foreground font-body text-xs" />
                <Button size="sm" onClick={addTour} disabled={!tourName.trim() || !tourDate}
                  className="font-display text-xs tracking-wider w-full min-h-[44px]">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Tour / Experience
                </Button>
              </div>
            )}
            {tours.map((tour: any) => (
              <div key={tour.id} className="border border-border rounded-lg p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-display text-sm text-foreground">{tour.tour_name}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {format(new Date(tour.tour_date + 'T00:00:00'), 'MMM d')} · {tour.pax} pax · ₱{tour.price}
                    </p>
                    {tour.provider && <p className="font-body text-xs text-muted-foreground">via {tour.provider}</p>}
                    {tour.pickup_time && <p className="font-body text-xs text-muted-foreground">Pickup: {tour.pickup_time}</p>}
                    {tour.notes && <p className="font-body text-xs text-foreground mt-1">{tour.notes}</p>}
                  </div>
                  <div className="flex gap-1 items-start">
                    {!readOnly ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTour(tour)} className="min-h-[28px] h-7 w-7 p-0">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Select value={tour.status} onValueChange={v => updateTourStatus(tour.id, v)}>
                          <SelectTrigger className="h-7 w-24 text-xs bg-secondary border-border text-foreground font-body">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="booked">Booked</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        {tour.status === 'confirmed' && (
                          <Button size="sm" variant="secondary" onClick={() => updateTourStatus(tour.id, 'completed')}
                            className="h-7 text-xs font-display tracking-wider px-2">
                            ✓ Done
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => deleteTour(tour.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="font-body text-xs">{tour.status}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {tours.length === 0 && <p className="font-body text-sm text-muted-foreground text-center py-2">No tours booked</p>}
          </div>
        )}

        {/* TIMELINE (PART 3) */}
        {detailTab === 'timeline' && (
          <GuestActivityTimeline booking={booking} unit={selectedUnit} />
        )}

        {/* VIBE */}
        {detailTab === 'vibe' && vibeMode === 'list' && (
          <div className="space-y-3">
            {!readOnly && (
              <Button onClick={() => { setEditingVibeRecord(null); setVibeMode('form'); }}
                className="w-full font-display text-xs tracking-wider min-h-[44px]">
                <Plus className="w-4 h-4 mr-2" /> New Vibe Check-In
              </Button>
            )}
            {unitVibeRecords.length === 0 ? (
              <p className="font-body text-sm text-muted-foreground text-center py-4">No vibe records for this room</p>
            ) : unitVibeRecords.map((rec: any) => {
              const isHigh = (rec.review_risk_level || []).includes('High');
              return (
                <button key={rec.id} onClick={() => { setViewingVibeRecord(rec); setVibeMode('detail'); }}
                  className={`w-full text-left border rounded-lg p-3 hover:bg-secondary/50 transition-colors ${isHigh ? 'border-2 border-destructive' : 'border-border'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-display text-sm text-foreground">{rec.guest_name}</p>
                      <p className="font-body text-xs text-muted-foreground">
                        {rec.nationality || 'N/A'} · {(rec.travel_composition || []).join(', ')}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {(rec.review_risk_level || []).map((r: string) => (
                        <Badge key={r} variant={r === 'High' ? 'destructive' : r === 'Medium' ? 'default' : 'secondary'}
                          className="font-body text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(rec.personality_type || []).map((p: string) => (
                      <Badge key={p} variant="outline" className="font-body text-xs">{p}</Badge>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* BILLING */}
        {detailTab === 'billing' && (
          <RoomBillingTab unit={selectedUnit} booking={booking} guestName={guest?.full_name || null} readOnly={readOnly} />
        )}

        {/* === MODALS === */}
        {booking && guest && (
          <EditGuestModal open={showEditGuest} onOpenChange={setShowEditGuest} guest={guest} booking={booking} />
        )}
        {editingTour && (
          <EditTourModal open={!!editingTour} onOpenChange={o => { if (!o) setEditingTour(null); }}
            tour={editingTour} unitName={selectedUnit.name} bookingId={currentBooking?.id || null} />
        )}

        {/* Extend Stay dialog */}
        <Dialog open={showExtendStay} onOpenChange={setShowExtendStay}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display tracking-wider text-sm">Extend Stay</DialogTitle>
            </DialogHeader>
            <div>
              <label className="font-body text-xs text-muted-foreground">New Check-out Date</label>
              <Input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)}
                className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExtendStay(false)} className="font-display text-xs tracking-wider">Cancel</Button>
              <Button onClick={handleExtendStay} className="font-display text-xs tracking-wider">Extend</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Room dialog */}
        <Dialog open={showChangeRoom} onOpenChange={setShowChangeRoom}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display tracking-wider text-sm">Change Room</DialogTitle>
            </DialogHeader>
            <div>
              <label className="font-body text-xs text-muted-foreground">Move guest to</label>
              <Select value={changeRoomId} onValueChange={setChangeRoomId}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                  <SelectValue placeholder="Select a ready room" />
                </SelectTrigger>
                <SelectContent>
                  {readyUnitsForChange.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowChangeRoom(false)} className="font-display text-xs tracking-wider">Cancel</Button>
              <Button onClick={handleChangeRoom} disabled={!changeRoomId} className="font-display text-xs tracking-wider">Move Guest</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // === GRID VIEW ===
  const occupiedUnits = units.filter((u: any) => getUnitStatus(u) === 'occupied' || getUnitGuest(u.name));
  const toCleanUnits = units.filter((u: any) => getUnitStatus(u) === 'to_clean');
  const readyUnits = units.filter((u: any) => getUnitStatus(u) === 'ready' && !getUnitGuest(u.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm tracking-wider text-foreground">Today's Room Status</h3>
          <p className="font-body text-[10px] text-muted-foreground">Present management — check-ins, check-outs & housekeeping</p>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-red-400">{occupiedUnits.length}</p>
          <p className="font-body text-xs text-red-400/70">Occupied</p>
        </div>
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-amber-400">{toCleanUnits.length}</p>
          <p className="font-body text-xs text-amber-400/70">To Clean</p>
        </div>
        <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-3 text-center">
          <p className="font-display text-2xl text-emerald-400">{readyUnits.length}</p>
          <p className="font-body text-xs text-emerald-400/70">Ready</p>
        </div>
      </div>

      {/* To Clean cards */}
      {toCleanUnits.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-display text-xs tracking-wider text-amber-400 uppercase">🟨 To Clean</h4>
          {toCleanUnits.map((unit: any) => {
            const hkOrder = getHousekeepingOrder(unit.name);
            return (
              <div key={unit.id} className="border-2 border-amber-500/40 bg-amber-500/5 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
                    {hkOrder?.assigned_to && (
                      <p className="font-body text-xs text-muted-foreground">Assigned: {getEmployeeName(hkOrder.assigned_to)}</p>
                    )}
                    {hkOrder && (
                      <Badge variant="outline" className={`font-body text-xs mt-1 ${hkOrder.status === 'inspection_cleared' ? 'text-emerald-400 border-emerald-500/40' : 'text-amber-400 border-amber-500/40'}`}>
                        {hkOrder.status === 'pre_inspection' ? '🔍 Pre-Inspection' : hkOrder.status === 'inspection_cleared' ? '✅ Cleared' : hkOrder.status === 'pending_inspection' ? 'Pending Inspection' : hkOrder.status === 'cleaning' ? '🧹 Cleaning' : hkOrder.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {hkOrder && !readOnly && (
                      <Button size="sm" onClick={() => setViewingHousekeepingOrder(hkOrder)}
                        className="font-display text-xs tracking-wider min-h-[44px]">
                        <ClipboardCheck className="w-4 h-4 mr-1" /> Start
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setSelectedUnit(unit); setDetailTab('info'); setVibeMode('list'); setShowCheckInForm(false); }}
                      className="font-display text-xs tracking-wider min-h-[44px]">View</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Closed Checkouts (admin can reopen) ── */}
      <ClosedCheckoutsPanel isAdmin={!readOnly} />

      {/* Room grid */}
      <h4 className="font-display text-xs tracking-wider text-muted-foreground uppercase">All Rooms</h4>
      <div className="grid grid-cols-2 gap-3">
        {units.map((unit: any) => {
          const booking = getUnitGuest(unit.name);
          const guest = (booking as any)?.resort_ops_guests;
          const isHighRisk = getUnitVibeRisk(unit.name);
          const status = getUnitStatus(unit);
          const arrivalBooking = getTodayArrivalBooking(unit);
          const departureBooking = getTodayDepartureBooking(unit);
          const workflow = getUnitWorkflow(unit);
          const borderColor = status === 'occupied' ? 'border-red-500/40' : status === 'to_clean' ? 'border-amber-500/40' : arrivalBooking ? 'border-blue-500/40' : 'border-emerald-500/40';
          const statusBg = status === 'occupied' ? 'bg-red-500/5' : status === 'to_clean' ? 'bg-amber-500/5' : arrivalBooking ? 'bg-blue-500/5' : '';
          const isFnF = booking?.platform === 'Friends & Family';
          const isVip = (booking?.notes || '').includes('[VIP]');

          return (
            <button key={unit.id} onClick={() => { setSelectedUnit(unit); setDetailTab('info'); setVibeMode('list'); setShowCheckInForm(false); }}
              className={`border-2 rounded-lg p-3 text-left hover:bg-secondary/50 transition-colors ${borderColor} ${statusBg} ${isHighRisk ? 'ring-2 ring-destructive' : ''}`}>
              <p className="font-display text-sm text-foreground tracking-wider">{unit.name}</p>
              {booking ? (
                <div className="mt-2">
                  <Badge className="font-body text-xs bg-red-500/20 text-red-400 border-red-500/40">
                    {departureBooking ? 'Departure Pending' : 'Occupied'}
                  </Badge>
                  <p className="font-body text-xs text-foreground mt-1">{guest?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(booking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(booking.check_out + 'T00:00:00'), 'MMM d')}
                  </p>
                  {arrivalBooking && (
                    <p className="font-body text-[10px] text-blue-400 mt-1 truncate">
                      Next: {arrivalBooking.resort_ops_guests?.full_name || 'Guest'}
                      {workflow.isExtensionReview ? ' · Review extension' : ' · Arrival today'}
                    </p>
                  )}
                  {workflow.isExtensionReview && (
                    <Badge variant="outline" className="font-body text-[10px] mt-1 border-blue-500/40 text-blue-400">Review extension</Badge>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {isFnF && <Badge variant="outline" className="font-body text-[10px] border-emerald-500/40 text-emerald-400">F&F</Badge>}
                    {isVip && <Badge variant="outline" className="font-body text-[10px] border-amber-500/40 text-amber-400">⭐ VIP</Badge>}
                  </div>
                </div>
              ) : status === 'to_clean' ? (
                <Badge className="font-body text-xs mt-2 bg-amber-500/20 text-amber-400 border-amber-500/40">To Clean</Badge>
              ) : arrivalBooking ? (
                <div className="mt-2">
                  <Badge className="font-body text-xs bg-blue-500/20 text-blue-400 border-blue-500/40">Ready for Check-in</Badge>
                  <p className="font-body text-xs text-foreground mt-1">{arrivalBooking.resort_ops_guests?.full_name || 'Guest'}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(arrivalBooking.check_in + 'T00:00:00'), 'MMM d')} – {format(new Date(arrivalBooking.check_out + 'T00:00:00'), 'MMM d')}
                  </p>
                  {workflow.isExtensionReview && (
                    <Badge variant="outline" className="font-body text-[10px] mt-1 border-blue-500/40 text-blue-400">Review duplicate / extension</Badge>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <Badge className="font-body text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Ready</Badge>
                  {(() => {
                    const upcoming = getUpcomingBooking(unit);
                    if (!upcoming) return null;
                    const upGuest = (upcoming as any)?.resort_ops_guests;
                    return (
                      <p className="font-body text-[10px] text-blue-400 mt-1 truncate">
                        📅 {upGuest?.full_name || 'Guest'} · {format(new Date(upcoming.check_in + 'T00:00:00'), 'MMM d')}
                      </p>
                    );
                  })()}
                </div>
              )}
              {isHighRisk && (
                <Badge variant="destructive" className="font-body text-xs mt-1">⚠ High Risk</Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RoomsDashboard;
