import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, isToday, isBefore } from 'date-fns';
import { Plus, Pencil, Trash2, Calendar as CalIcon, Clock, Copy, ChevronLeft, ChevronRight, ClipboardList, MapPin, Sparkles, CheckCircle2, Check } from 'lucide-react';

type Employee = { id: string; name: string };
type Task = {
  id: string; employee_id: string; title: string; description: string;
  status: string; due_date: string | null; created_by: string;
  completed_at?: string | null;
};
type Schedule = {
  id: string; employee_id: string; schedule_date: string;
  time_in: string; time_out: string; created_at: string; updated_at: string;
};

type TimelineSchedule = Schedule & {
  render_id: string;
  render_time_in: string;
  render_time_out: string;
  continues_from_previous?: boolean;
  continues_to_next?: boolean;
};

const from = (table: string) => supabase.from(table as any);

const TIMELINE_START = 0;
const TIMELINE_END = 24;
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;

const HOURS = Array.from({ length: TIMELINE_HOURS }, (_, i) => TIMELINE_START + i);

const fmtHour = (h: number) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${ampm}`;
};

const fmtTime = (t: string) => {
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return t; }
};

const PRESETS = [
  { label: 'Morning', time_in: '07:00', time_out: '16:00' },
  { label: 'Evening', time_in: '12:00', time_out: '21:00' },
  { label: 'Night', time_in: '21:00', time_out: '09:00' },
  { label: 'Maintenance', time_in: '08:00', time_out: '17:00' },
];

const inferShiftType = (time_in: string, time_out: string): string => {
  const tin = time_in.slice(0, 5);
  const tout = time_out.slice(0, 5);
  if (tin === '07:00' && tout === '16:00') return 'Morning';
  if (tin === '12:00' && tout === '21:00') return 'Evening';
  if (tin === '21:00' && tout === '09:00') return 'Night';
  if (tin === '08:00' && tout === '17:00') return 'Maintenance';
  if ((tin === '07:00' && tout === '11:00') || (tin === '17:00' && tout === '21:00')) return 'Broken';
  // Detect generic overnight shifts
  if (tout < tin) return 'Night';
  return 'Custom';
};

const SHIFT_COLORS: Record<string, string> = {
  Morning: 'bg-blue-500/30 border-blue-500/50',
  Evening: 'bg-purple-500/30 border-purple-500/50',
  Night: 'bg-indigo-500/30 border-indigo-500/50',
  Maintenance: 'bg-green-500/30 border-green-500/50',
  Broken: 'bg-orange-500/30 border-orange-500/50',
  Custom: 'bg-accent/20 border-accent/40',
};

const SHIFT_TEXT_COLORS: Record<string, string> = {
  Morning: 'text-blue-300',
  Evening: 'text-purple-300',
  Night: 'text-indigo-300',
  Maintenance: 'text-green-300',
  Broken: 'text-orange-300',
  Custom: 'text-accent',
};

const timeToPercent = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  const totalMinutes = (h - TIMELINE_START) * 60 + m;
  const totalRange = TIMELINE_HOURS * 60;
  return Math.max(0, Math.min(100, (totalMinutes / totalRange) * 100));
};

const WeeklyScheduleManager = ({ readOnly = false }: { readOnly?: boolean }) => {
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => new Date().getDay());

  const [shiftModal, setShiftModal] = useState<{ mode: 'add' | 'edit'; schedule?: Schedule; date?: string; empId?: string } | null>(null);
  const [shiftForm, setShiftForm] = useState({ employee_id: '', schedule_date: '', time_in: '07:00', time_out: '16:00', selected_days: [] as string[], selected_employees: [] as string[] });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteIdRef = useRef<string | null>(null);
  useEffect(() => { deleteIdRef.current = deleteId; }, [deleteId]);
  const [contextSheet, setContextSheet] = useState<Schedule | null>(null);

  // Task assignment modal
  const [taskModal, setTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    employee_id: '', task_type: 'custom' as 'housecleaning' | 'reception' | 'custom',
    title: '', description: '', due_date: '', due_time: '09:00', unit_name: '',
  });

  // Task editing
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: '', description: '', due_date: '', due_time: '', employee_id: '' });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-schedule'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, name').eq('active', true).order('name');
      return (data || []) as Employee[];
    },
  });

  // Fetch units for housekeeping assignment
  const { data: units = [] } = useQuery({
    queryKey: ['schedule-units'],
    queryFn: async () => {
      const { data } = await from('units').select('id, unit_name').order('unit_name');
      return (data || []) as unknown as { id: string; unit_name: string }[];
    },
  });

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const fetchStartStr = format(addDays(weekStart, -1), 'yyyy-MM-dd');

  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ['weekly-schedules', startStr],
    queryFn: async () => {
      const { data } = await supabase.from('weekly_schedules').select('*')
        .gte('schedule_date', fetchStartStr).lte('schedule_date', endStr);
      return (data || []) as Schedule[];
    },
  });

  const { data: weekTasks = [] } = useQuery<Task[]>({
    queryKey: ['week-tasks', startStr],
    queryFn: async () => {
      const { data } = await supabase.from('employee_tasks').select('*')
        .gte('due_date', startStr + 'T00:00:00')
        .lte('due_date', endStr + 'T23:59:59');
      return (data || []) as Task[];
    },
  });

  const { data: undatedTasks = [] } = useQuery<Task[]>({
    queryKey: ['undated-tasks'],
    queryFn: async () => {
      const { data } = await supabase.from('employee_tasks').select('*')
        .is('due_date', null)
        .neq('status', 'completed');
      return (data || []) as Task[];
    },
  });

  const { data: weekTours = [] } = useQuery({
    queryKey: ['week-tours', startStr],
    queryFn: async () => {
      const { data } = await from('guest_tours').select('*')
        .gte('tour_date', startStr)
        .lte('tour_date', endStr)
        .neq('status', 'cancelled');
      return (data || []) as any[];
    },
  });

  const { data: weekHkOrders = [] } = useQuery({
    queryKey: ['week-hk-orders', startStr],
    queryFn: async () => {
      const { data } = await from('housekeeping_orders').select('*')
        .not('assigned_to', 'is', null)
        .gte('created_at', startStr + 'T00:00:00')
        .lte('created_at', endStr + 'T23:59:59');
      return (data || []) as any[];
    },
  });

  const getTasksForEmpDate = (empId: string, dateStr: string) =>
    weekTasks.filter(t => t.employee_id === empId && t.due_date?.startsWith(dateStr));

  const getUndatedTasksForEmp = (empId: string) =>
    undatedTasks.filter(t => t.employee_id === empId);

  const getToursForDate = (dateStr: string) =>
    weekTours.filter((t: any) => t.tour_date === dateStr);

  const getHkForEmpDate = (empId: string, dateStr: string) =>
    weekHkOrders.filter((o: any) => o.assigned_to === empId && o.created_at.startsWith(dateStr));

  const getTaskColor = (task: Task) => {
    if (task.status === 'completed') return 'bg-emerald-500';
    if (task.status === 'in_progress') return 'bg-amber-500';
    if (task.due_date && isBefore(new Date(task.due_date), new Date()) && task.status === 'pending') return 'bg-destructive';
    return 'bg-blue-500';
  };

  const getTaskPosition = (task: Task): number => {
    if (!task.due_date) return 0;
    const d = new Date(task.due_date);
    const h = d.getHours();
    const m = d.getMinutes();
    const totalMinutes = (h - TIMELINE_START) * 60 + m;
    const totalRange = TIMELINE_HOURS * 60;
    return Math.max(0, Math.min(100, (totalMinutes / totalRange) * 100));
  };

  useEffect(() => {
    const ch = supabase.channel('schedules-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_schedules' }, () => {
        qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        qc.invalidateQueries({ queryKey: ['employees-schedule'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['week-tasks'] });
        qc.invalidateQueries({ queryKey: ['undated-tasks'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_orders' }, () => {
        qc.invalidateQueries({ queryKey: ['week-hk-orders'] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const empMap = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const openAdd = (date?: string, empId?: string) => {
    const d = date || format(weekDates[selectedDayIdx], 'yyyy-MM-dd');
    setShiftForm({ employee_id: empId || '', schedule_date: d, time_in: '07:00', time_out: '16:00', selected_days: [d], selected_employees: empId ? [empId] : [] });
    setShiftModal({ mode: 'add', date, empId });
  };

  const openEdit = (s: Schedule) => {
    setShiftForm({ employee_id: s.employee_id, schedule_date: s.schedule_date, time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5), selected_days: [s.schedule_date], selected_employees: [s.employee_id] });
    setShiftModal({ mode: 'edit', schedule: s });
  };

  const openTaskModal = (date?: string, empId?: string) => {
    setTaskForm({
      employee_id: empId || employees[0]?.id || '',
      task_type: 'custom',
      title: '',
      description: '',
      due_date: date || format(weekDates[selectedDayIdx], 'yyyy-MM-dd'),
      due_time: '09:00',
      unit_name: '',
    });
    setTaskModal(true);
  };

  const checkOverlap = useCallback((empId: string, date: string, timeIn: string, timeOut: string, excludeId?: string) => {
    return schedules.filter(s =>
      s.employee_id === empId && s.schedule_date === date && s.id !== excludeId
    ).some(s => {
      const sIn = s.time_in.slice(0, 5);
      const sOut = s.time_out.slice(0, 5);
      // Handle overnight shifts for both existing and new
      const existingOvernight = sOut <= sIn;
      const newOvernight = timeOut <= timeIn;
      if (existingOvernight && newOvernight) return true; // both overnight always overlap
      if (existingOvernight) return timeIn >= sIn || timeOut <= sOut;
      if (newOvernight) return sIn >= timeIn || sOut <= timeOut;
      return timeIn < sOut && timeOut > sIn;
    });
  }, [schedules]);

  const saveShift = async (keepOpen = false) => {
    if (shiftModal?.mode === 'edit' && shiftModal.schedule) {
      if (!shiftForm.employee_id) return;
      if (checkOverlap(shiftForm.employee_id, shiftForm.schedule_date, shiftForm.time_in, shiftForm.time_out, shiftModal.schedule.id)) {
        toast.warning('This shift overlaps with an existing shift for this employee');
      }
      await supabase.from('weekly_schedules').update({
        employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date,
        time_in: shiftForm.time_in, time_out: shiftForm.time_out,
      }).eq('id', shiftModal.schedule.id);
      toast.success('Shift updated');
    } else {
      // Multi-day + multi-employee insert
      const days = shiftForm.selected_days.length > 0 ? shiftForm.selected_days : [shiftForm.schedule_date];
      const emps = shiftForm.selected_employees.length > 0 ? shiftForm.selected_employees : (shiftForm.employee_id ? [shiftForm.employee_id] : []);
      if (days.length === 0) { toast.error('Select at least one day'); return; }
      if (emps.length === 0) { toast.error('Select at least one employee'); return; }
      let overlapCount = 0;
      const rows: { employee_id: string; schedule_date: string; time_in: string; time_out: string }[] = [];
      emps.forEach(empId => {
        days.forEach(d => {
          if (checkOverlap(empId, d, shiftForm.time_in, shiftForm.time_out)) overlapCount++;
          rows.push({ employee_id: empId, schedule_date: d, time_in: shiftForm.time_in, time_out: shiftForm.time_out });
        });
      });
      if (overlapCount > 0) toast.warning(`${overlapCount} shift(s) overlap with existing shifts`);
      await supabase.from('weekly_schedules').insert(rows);
      toast.success(`${rows.length} shift(s) added`);
    }
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
    if (keepOpen) {
      // Reset employees but keep time/days for rapid re-use
      setShiftForm(prev => ({ ...prev, selected_employees: [], employee_id: '' }));
    } else {
      setShiftModal(null);
    }
  };

  const addBrokenShift = async () => {
    if (!shiftForm.employee_id || !shiftForm.schedule_date) return;
    await supabase.from('weekly_schedules').insert([
      { employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date, time_in: '07:00', time_out: '11:00' },
      { employee_id: shiftForm.employee_id, schedule_date: shiftForm.schedule_date, time_in: '17:00', time_out: '21:00' },
    ]);
    toast.success('Broken shift added');
    setShiftModal(null);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const confirmDelete = async (scheduleId?: string) => {
    const idToDelete = scheduleId || deleteIdRef.current;
    if (!idToDelete) {
      toast.error('No shift selected for deletion');
      return;
    }

    setDeleteId(null);
    const { error } = await supabase.from('weekly_schedules').delete().eq('id', idToDelete);
    if (error) {
      toast.error(`Failed to delete shift: ${error.message}`);
      return;
    }

    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
    toast.success('Shift deleted');
  };

  const duplicateShift = async (s: Schedule) => {
    const nextDate = format(addDays(new Date(s.schedule_date + 'T00:00:00'), 1), 'yyyy-MM-dd');
    await supabase.from('weekly_schedules').insert({
      employee_id: s.employee_id, schedule_date: nextDate,
      time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5),
    });
    toast.success('Shift duplicated to next day');
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const copyPreviousWeek = async () => {
    const prevStart = format(addDays(weekStart, -7), 'yyyy-MM-dd');
    const prevEnd = format(addDays(weekStart, -1), 'yyyy-MM-dd');
    const { data: prevSchedules } = await supabase.from('weekly_schedules').select('*')
      .gte('schedule_date', prevStart).lte('schedule_date', prevEnd);
    if (!prevSchedules?.length) { toast.error('No shifts found in previous week'); return; }
    const newShifts = prevSchedules.map(s => ({
      employee_id: s.employee_id,
      schedule_date: format(addDays(new Date(s.schedule_date + 'T00:00:00'), 7), 'yyyy-MM-dd'),
      time_in: s.time_in.slice(0, 5), time_out: s.time_out.slice(0, 5),
    }));
    await supabase.from('weekly_schedules').insert(newShifts);
    toast.success(`Copied ${newShifts.length} shifts from previous week`);
    qc.invalidateQueries({ queryKey: ['weekly-schedules'] });
  };

  const goCurrentWeek = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    setSelectedDayIdx(new Date().getDay());
  };

  const getDateShifts = (dateStr: string): TimelineSchedule[] => {
    const prevDateStr = format(addDays(new Date(`${dateStr}T00:00:00`), -1), 'yyyy-MM-dd');

    const todayShifts = schedules
      .filter(s => s.schedule_date === dateStr)
      .map<TimelineSchedule>(s => {
        const timeIn = s.time_in.slice(0, 5);
        const timeOut = s.time_out.slice(0, 5);
        const isOvernight = timeOut <= timeIn;

        return {
          ...s,
          render_id: s.id,
          render_time_in: timeIn,
          render_time_out: isOvernight ? '24:00' : timeOut,
          continues_to_next: isOvernight,
        };
      });

    const carryOverShifts = schedules
      .filter(s => s.schedule_date === prevDateStr && s.time_out.slice(0, 5) <= s.time_in.slice(0, 5))
      .map<TimelineSchedule>(s => ({
        ...s,
        render_id: `${s.id}-carry-${dateStr}`,
        render_time_in: '00:00',
        render_time_out: s.time_out.slice(0, 5),
        continues_from_previous: true,
      }));

    return [...carryOverShifts, ...todayShifts].sort((a, b) =>
      a.render_time_in.localeCompare(b.render_time_in)
    );
  };

  // Save task assignment
  const saveTask = async () => {
    if (!taskForm.employee_id) { toast.error('Select an employee'); return; }
    const empName = empMap[taskForm.employee_id]?.name || 'admin';
    const dueDate = taskForm.due_date && taskForm.due_time
      ? `${taskForm.due_date}T${taskForm.due_time}:00`
      : taskForm.due_date ? `${taskForm.due_date}T09:00:00` : null;

    if (taskForm.task_type === 'housecleaning') {
      if (!taskForm.unit_name) { toast.error('Select a room/unit'); return; }
      await from('housekeeping_orders').insert({
        unit_name: taskForm.unit_name,
        assigned_to: taskForm.employee_id,
        status: 'pending_inspection',
        priority: 'normal',
        cleaning_notes: taskForm.description || '',
      });
      // Also create an employee_task for visibility
      await supabase.from('employee_tasks').insert({
        employee_id: taskForm.employee_id,
        title: `Clean ${taskForm.unit_name}`,
        description: taskForm.description || `Housekeeping for ${taskForm.unit_name}`,
        due_date: dueDate,
        created_by: 'admin',
        status: 'pending',
      });
      toast.success(`Housekeeping assigned: ${taskForm.unit_name}`);
    } else {
      const title = taskForm.task_type === 'reception'
        ? taskForm.title || 'Reception duty'
        : taskForm.title;
      if (!title) { toast.error('Enter a task title'); return; }
      await supabase.from('employee_tasks').insert({
        employee_id: taskForm.employee_id,
        title,
        description: taskForm.description,
        due_date: dueDate,
        created_by: 'admin',
        status: 'pending',
      });
      toast.success('Task assigned');
    }
    setTaskModal(false);
    qc.invalidateQueries({ queryKey: ['week-tasks'] });
    qc.invalidateQueries({ queryKey: ['undated-tasks'] });
    qc.invalidateQueries({ queryKey: ['week-hk-orders'] });
  };

  // Archive task (soft delete)
  const deleteTask = async (taskId: string) => {
    await (supabase.from('employee_tasks') as any).update({ archived_at: new Date().toISOString() }).eq('id', taskId);
    qc.invalidateQueries({ queryKey: ['week-tasks'] });
    qc.invalidateQueries({ queryKey: ['undated-tasks'] });
    toast.success('Task archived');
  };

  // Update task
  const saveEditTask = async () => {
    if (!editingTask) return;
    const dueDate = editTaskForm.due_date && editTaskForm.due_time
      ? `${editTaskForm.due_date}T${editTaskForm.due_time}:00`
      : editTaskForm.due_date ? `${editTaskForm.due_date}T09:00:00` : null;
    await supabase.from('employee_tasks').update({
      title: editTaskForm.title,
      description: editTaskForm.description,
      due_date: dueDate,
      employee_id: editTaskForm.employee_id,
    }).eq('id', editingTask.id);
    setEditingTask(null);
    qc.invalidateQueries({ queryKey: ['week-tasks'] });
    qc.invalidateQueries({ queryKey: ['undated-tasks'] });
    toast.success('Task updated');
  };

  const openEditTask = (task: Task) => {
    const d = task.due_date ? new Date(task.due_date) : null;
    setEditTaskForm({
      title: task.title,
      description: task.description || '',
      due_date: d ? format(d, 'yyyy-MM-dd') : '',
      due_time: d ? format(d, 'HH:mm') : '',
      employee_id: task.employee_id,
    });
    setEditingTask(task);
  };

  // Shift Block Component
  const ShiftBlock = ({ s, compact = false }: { s: TimelineSchedule; compact?: boolean }) => {
    const type = inferShiftType(s.time_in, s.time_out);
    const renderTimeIn = s.render_time_in || s.time_in.slice(0, 5);
    const renderTimeOut = s.render_time_out || s.time_out.slice(0, 5);
    const left = timeToPercent(renderTimeIn);
    const right = timeToPercent(renderTimeOut);
    const width = Math.max(right - left, 2);
    const isContinuation = !!(s.continues_from_previous || s.continues_to_next);
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const actionClickedRef = useRef(false);

    const handleTouchStart = () => {
      longPressRef.current = setTimeout(() => {
        setContextSheet(s);
      }, 500);
    };
    const handleTouchEnd = () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };

    const handleBlockClick = () => {
      // Don't open edit if an action button was just clicked
      if (actionClickedRef.current) {
        actionClickedRef.current = false;
        return;
      }
      openEdit(s);
    };

    const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      actionClickedRef.current = true;
      openEdit(s);
    };

    const handleDeleteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      actionClickedRef.current = true;
      setDeleteId(s.id);
    };

    const block = (
      <div
        className={`absolute z-10 top-0.5 bottom-0.5 rounded border ${SHIFT_COLORS[type]} cursor-pointer
          transition-all hover:shadow-lg hover:shadow-background/20 hover:scale-[1.02] hover:z-20
          flex items-center overflow-hidden group/block`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: compact ? '30px' : '40px' }}
        onClick={handleBlockClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        data-shift-block="true"
      >
          <div className={`px-1 flex items-center gap-0.5 w-full min-h-[40px] ${compact ? 'min-h-[36px]' : 'min-h-[44px]'}`}>
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-body font-semibold ${SHIFT_TEXT_COLORS[type]} truncate`}>
                {empMap[s.employee_id]?.name || '?'}
              </div>
              <div className="text-[9px] font-body text-foreground/60 truncate">
                {fmtTime(s.time_in)} – {fmtTime(s.time_out)}
                {isContinuation && <span className="ml-0.5 text-[8px] text-muted-foreground">↔</span>}
              </div>
              <span className={`text-[8px] font-display ${SHIFT_TEXT_COLORS[type]} opacity-80`}>{type}</span>
            </div>
          {!readOnly && (
            <div className="flex gap-0.5 shrink-0">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleEditClick}
                className="p-1.5 rounded hover:bg-background/30 text-foreground/60 hover:text-accent min-w-[28px] min-h-[28px] flex items-center justify-center"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleDeleteClick}
                className="p-1.5 rounded hover:bg-background/30 text-foreground/60 hover:text-destructive min-w-[28px] min-h-[28px] flex items-center justify-center"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );

    if (!isMobile) {
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>{block}</ContextMenuTrigger>
          <ContextMenuContent className="bg-card border-border">
            <ContextMenuItem className="font-body text-sm" onClick={() => openEdit(s)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </ContextMenuItem>
            <ContextMenuItem className="font-body text-sm" onClick={() => duplicateShift(s)}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate to Next Day
            </ContextMenuItem>
            <ContextMenuItem className="font-body text-sm text-destructive" onClick={() => setDeleteId(s.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return block;
  };

  // Task detail state
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [viewingHk, setViewingHk] = useState<any | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const deleteTaskIdRef = useRef<string | null>(null);
  useEffect(() => { deleteTaskIdRef.current = deleteTaskId; }, [deleteTaskId]);

  const confirmDeleteTask = async () => {
    const id = deleteTaskIdRef.current;
    if (!id) return;
    setDeleteTaskId(null);
    setViewingTask(null);
    await deleteTask(id);
  };

  // Timeline Row for one employee on one date
  const TimelineRow = ({ emp, dateStr, compact = false }: { emp: Employee; dateStr: string; compact?: boolean }) => {
    const shifts = getDateShifts(dateStr).filter(s => s.employee_id === emp.id);
    const tasks = getTasksForEmpDate(emp.id, dateStr);
    const empUndatedTasks = getUndatedTasksForEmp(emp.id);
    const hkOrders = getHkForEmpDate(emp.id, dateStr);
    const activityCount = tasks.length + empUndatedTasks.length + hkOrders.length;
    return (
      <div className="border-b border-border last:border-b-0">
        <div className="flex items-stretch">
          <div className={`shrink-0 ${compact ? 'w-16' : 'w-28'} p-1.5 font-body text-xs font-semibold text-foreground border-r border-border flex items-center gap-1`}>
            <span className="truncate">{emp.name}</span>
            {activityCount > 0 && (
              <Badge variant="secondary" className="text-[8px] h-4 min-w-[16px] px-1 bg-blue-500/20 text-blue-400 border-none">
                {activityCount}
              </Badge>
            )}
          </div>
          <div className="flex-1 relative" style={{ minHeight: compact ? '40px' : '48px' }}>
            {HOURS.filter(h => h % 3 === 0).map(h => (
              <div key={h} className="absolute top-0 bottom-0 border-r border-border/30"
                style={{ left: `${((h - TIMELINE_START) / TIMELINE_HOURS) * 100}%` }} />
            ))}
            {shifts.map(s => <ShiftBlock key={s.render_id} s={s} compact={compact} />)}
            <TooltipProvider delayDuration={200}>
              {tasks.map(task => {
                const pos = getTaskPosition(task);
                return (
                  <Tooltip key={task.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={`absolute z-20 w-5 h-5 rounded-full ${getTaskColor(task)} flex items-center justify-center shadow-md
                          hover:scale-125 transition-transform cursor-pointer`}
                        style={{ left: `calc(${pos}% - 10px)`, top: compact ? '10px' : '14px' }}
                        onClick={(e) => { e.stopPropagation(); setViewingTask(task); }}
                      >
                        {task.status === 'completed'
                          ? <CheckCircle2 className="h-3 w-3 text-white stroke-[4]" />
                          : <ClipboardList className="h-3 w-3 text-white" />
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-card border-border text-foreground font-body text-xs max-w-[200px]">
                      <p className="font-semibold">{task.title}</p>
                      {task.due_date && <p className="text-muted-foreground text-[10px]">{format(new Date(task.due_date), 'h:mm a')}</p>}
                      <p className="text-[10px] capitalize text-muted-foreground">{task.status}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
            {!readOnly && <div className="absolute inset-0 z-0" onClick={() => openAdd(dateStr, emp.id)} />}
          </div>
          {!readOnly && (
            <div className="shrink-0 w-8 flex items-center justify-center border-l border-border">
              <button onClick={() => openAdd(dateStr, emp.id)} className="text-muted-foreground hover:text-accent p-1">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        {(empUndatedTasks.length > 0 || hkOrders.length > 0) && (
          <div className={`flex items-center gap-1 px-2 py-1 bg-secondary/30 border-t border-border/30 ${compact ? 'ml-16' : 'ml-28'}`}>
            <ClipboardList className="h-3 w-3 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              {empUndatedTasks.map(task => (
                <button key={task.id} onClick={() => setViewingTask(task)}
                  className={`text-[10px] font-body px-1.5 py-0.5 rounded ${
                    task.status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                  } hover:opacity-80 transition-opacity`}>
                  {task.title}
                </button>
              ))}
              {hkOrders.map((o: any) => (
                <button key={o.id} onClick={() => setViewingHk(o)}
                  className="text-[10px] font-body px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 hover:opacity-80 transition-opacity">
                  <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />{o.unit_name}
                  {o.cleaning_completed_at && <CheckCircle2 className="h-2.5 w-2.5 inline ml-0.5 text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const ToursSummaryRow = ({ dateStr }: { dateStr: string }) => {
    const tours = getToursForDate(dateStr);
    if (tours.length === 0) return null;
    return (
      <div className="border-b border-border bg-teal-500/5">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <MapPin className="h-3 w-3 text-teal-400 shrink-0" />
          <span className="font-body text-[10px] text-teal-400 font-semibold mr-1">Tours:</span>
          <div className="flex flex-wrap gap-1">
            {tours.map((t: any) => (
              <span key={t.id} className="text-[10px] font-body px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400">
                {t.tour_name} · {t.unit_name} {t.pickup_time && `· ${t.pickup_time}`}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const HEADER_HOURS = [...HOURS.filter(h => h % 3 === 0), 24];

  const TimelineHeader = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex border-b border-border">
      <div className={`shrink-0 ${compact ? 'w-16' : 'w-28'} border-r border-border`} />
      <div className="flex-1 relative" style={{ height: '24px' }}>
        {HEADER_HOURS.map(h => (
          <div key={h} className="absolute top-0 bottom-0 flex items-center"
            style={{ left: `${((h - TIMELINE_START) / TIMELINE_HOURS) * 100}%`, transform: h === 24 ? 'translateX(-100%)' : undefined }}>
            <span className={`font-body ${compact ? 'text-[7px]' : 'text-[9px]'} text-muted-foreground whitespace-nowrap ${h === 24 ? 'pr-0.5' : 'pl-0.5'}`}>
              {h === 24 ? '12AM' : fmtHour(h)}
            </span>
          </div>
        ))}
      </div>
      <div className="shrink-0 w-8 border-l border-border" />
    </div>
  );

  // Task Detail Dialog content (reused in mobile + desktop)
  const TaskDetailContent = ({ task }: { task: Task }) => (
    <div className="space-y-3">
      <div>
        <p className="font-display text-sm text-foreground">{task.title}</p>
        {task.description && (
          <p className="font-body text-xs text-muted-foreground mt-1">{task.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
        <span>Assigned to: <span className="font-semibold text-foreground">{empMap[task.employee_id]?.name || '?'}</span></span>
      </div>
      <div className="flex items-center gap-2 text-xs font-body text-muted-foreground">
        <span className="capitalize">Status: <span className={`font-semibold ${
          task.status === 'completed' ? 'text-emerald-400' :
          task.status === 'in_progress' ? 'text-amber-400' :
          (task.due_date && isBefore(new Date(task.due_date), new Date())) ? 'text-destructive' : 'text-blue-400'
        }`}>{task.status}</span></span>
      </div>
      {task.due_date && (
        <p className="font-body text-xs text-muted-foreground">
          Due: {format(new Date(task.due_date), 'MMM d, yyyy h:mm a')}
        </p>
      )}
      {task.completed_at && (
        <p className="font-body text-xs text-emerald-400">
          ✓ Completed: {format(new Date(task.completed_at), 'MMM d, yyyy h:mm a')}
        </p>
      )}
      <p className="font-body text-[11px] text-muted-foreground">Created by: {task.created_by}</p>
      <div className="flex gap-2 pt-1">
        {task.status !== 'completed' && (
          <Button size="sm" className="flex-1 font-display text-xs" onClick={async () => {
            await supabase.from('employee_tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id);
            qc.invalidateQueries({ queryKey: ['week-tasks'] });
            qc.invalidateQueries({ queryKey: ['undated-tasks'] });
            setViewingTask(null);
            toast.success('Task completed');
          }}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Complete
          </Button>
        )}
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" className="font-display text-xs" onClick={() => { setViewingTask(null); openEditTask(task); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="font-display text-xs text-destructive hover:text-destructive" onClick={() => setDeleteTaskId(task.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );

  // HK Detail Dialog content
  const HkDetailContent = ({ order }: { order: any }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <p className="font-display text-sm text-foreground">Housekeeping: {order.unit_name}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-body">
        <div><span className="text-muted-foreground">Status:</span> <span className="font-semibold capitalize text-foreground">{order.status?.replace(/_/g, ' ')}</span></div>
        <div><span className="text-muted-foreground">Priority:</span> <span className="capitalize text-foreground">{order.priority}</span></div>
        {order.assigned_to && <div><span className="text-muted-foreground">Assigned to:</span> <span className="text-foreground">{empMap[order.assigned_to]?.name || '?'}</span></div>}
        {order.accepted_by_name && <div><span className="text-muted-foreground">Accepted by:</span> <span className="text-foreground">{order.accepted_by_name}</span></div>}
      </div>
      {order.inspection_completed_at && (
        <p className="font-body text-xs text-blue-400">
          🔍 Inspected: {format(new Date(order.inspection_completed_at), 'MMM d h:mm a')} {order.inspection_by_name && `by ${order.inspection_by_name}`}
        </p>
      )}
      {order.cleaning_completed_at && (
        <p className="font-body text-xs text-emerald-400">
          ✓ Cleaned: {format(new Date(order.cleaning_completed_at), 'MMM d h:mm a')} {order.completed_by_name && `by ${order.completed_by_name}`}
        </p>
      )}
      {order.cleaning_notes && (
        <p className="font-body text-xs text-muted-foreground">Notes: {order.cleaning_notes}</p>
      )}
      {order.damage_notes && (
        <p className="font-body text-xs text-destructive">Damage: {order.damage_notes}</p>
      )}
    </div>
  );

  // MOBILE VIEW
  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-wider text-foreground">Schedule</h2>
            {!readOnly && (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="font-display text-[10px] h-9 px-2" onClick={copyPreviousWeek}>
                  <Copy className="h-3 w-3 mr-1" /> Copy Week
                </Button>
                <Button size="sm" variant="outline" className="font-display text-[10px] h-9 px-2" onClick={() => openTaskModal()}>
                  <ClipboardList className="h-3 w-3 mr-1" /> Task
                </Button>
                <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => openAdd()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Shift
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 font-body text-xs h-9" onClick={goCurrentWeek}>
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
            </Button>
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {weekDates.map((d, i) => {
              const today = isToday(d);
              const active = selectedDayIdx === i;
              return (
                <button key={i} onClick={() => setSelectedDayIdx(i)}
                  className={`shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded font-body text-xs transition-colors
                    ${active ? 'bg-accent text-accent-foreground' : today ? 'bg-accent/20 text-accent' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}>
                  <span className="text-[10px]">{format(d, 'EEE')}</span>
                  <span className="font-semibold">{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0 overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: '600px' }}>
              <TimelineHeader compact />
              <ToursSummaryRow dateStr={format(weekDates[selectedDayIdx], 'yyyy-MM-dd')} />
              {employees.map(emp => (
                <TimelineRow key={emp.id} emp={emp} dateStr={format(weekDates[selectedDayIdx], 'yyyy-MM-dd')} compact />
              ))}
              {employees.length === 0 && (
                <div className="p-4 text-center font-body text-xs text-muted-foreground">No employees found</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Sheet open={!!contextSheet} onOpenChange={() => setContextSheet(null)}>
          <SheetContent side="bottom" className="bg-card border-border">
            <SheetHeader>
              <SheetTitle className="font-display text-foreground">
                {contextSheet ? empMap[contextSheet.employee_id]?.name : ''} — {contextSheet ? fmtTime(contextSheet.time_in) + ' – ' + fmtTime(contextSheet.time_out) : ''}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-2 pt-3">
              <Button variant="outline" className="w-full justify-start font-body h-11" onClick={() => { if (contextSheet) openEdit(contextSheet); setContextSheet(null); }}>
                <Pencil className="h-4 w-4 mr-3" /> Edit Shift
              </Button>
              <Button variant="outline" className="w-full justify-start font-body h-11" onClick={() => { if (contextSheet) duplicateShift(contextSheet); setContextSheet(null); }}>
                <Copy className="h-4 w-4 mr-3" /> Duplicate to Next Day
              </Button>
              <Button variant="outline" className="w-full justify-start font-body text-destructive h-11" onClick={() => { if (contextSheet) setDeleteId(contextSheet.id); setContextSheet(null); }}>
                <Trash2 className="h-4 w-4 mr-3" /> Delete Shift
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <ShiftModal shiftModal={shiftModal} shiftForm={shiftForm} setShiftForm={setShiftForm}
          employees={employees} weekDates={weekDates} saveShift={saveShift} addBrokenShift={addBrokenShift}
          onClose={() => setShiftModal(null)}
          onDelete={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { setShiftModal(null); setDeleteId(shiftModal.schedule!.id); } : undefined}
          onDuplicate={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { duplicateShift(shiftModal.schedule!); setShiftModal(null); } : undefined} />

        <DeleteConfirm deleteId={deleteId} setDeleteId={setDeleteId} onConfirm={confirmDelete} />

        {/* Task detail */}
        <Dialog open={!!viewingTask} onOpenChange={() => setViewingTask(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">Task Details</DialogTitle>
            </DialogHeader>
            {viewingTask && <TaskDetailContent task={viewingTask} />}
          </DialogContent>
        </Dialog>

        {/* HK detail */}
        <Dialog open={!!viewingHk} onOpenChange={() => setViewingHk(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">Housekeeping Details</DialogTitle>
            </DialogHeader>
            {viewingHk && <HkDetailContent order={viewingHk} />}
          </DialogContent>
        </Dialog>

        <TaskAssignModal open={taskModal} onClose={() => setTaskModal(false)} form={taskForm} setForm={setTaskForm}
          employees={employees} units={units} onSave={saveTask} />

        <EditTaskModal open={!!editingTask} onClose={() => setEditingTask(null)} form={editTaskForm} setForm={setEditTaskForm}
          employees={employees} onSave={saveEditTask} />

        <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-foreground">Delete Task?</AlertDialogTitle>
              <AlertDialogDescription className="font-body text-muted-foreground">This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-display text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTask} className="font-display text-xs bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // DESKTOP VIEW
  const selectedDate = weekDates[selectedDayIdx];
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-grow">
          <CalIcon className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-lg tracking-wider text-foreground">Schedule Timeline</h2>
        </div>
        {!readOnly && (
          <>
            <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={copyPreviousWeek}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Previous Week
            </Button>
            <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => openTaskModal()}>
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Assign Task
            </Button>
            <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={() => openAdd()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Shift
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-body text-sm text-accent">
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="font-display text-xs h-9" onClick={goCurrentWeek}>
          Current Week
        </Button>
      </div>

      <div className="flex gap-1">
        {weekDates.map((d, i) => {
          const today = isToday(d);
          const active = selectedDayIdx === i;
          const dayShiftCount = getDateShifts(format(d, 'yyyy-MM-dd')).length;
          const dayTourCount = getToursForDate(format(d, 'yyyy-MM-dd')).length;
          return (
            <button key={i} onClick={() => setSelectedDayIdx(i)}
              className={`flex-1 flex flex-col items-center px-3 py-2 rounded font-body text-sm transition-colors
                ${active ? 'bg-accent text-accent-foreground' : today ? 'bg-accent/15 text-accent' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}>
              <span className="text-xs">{format(d, 'EEE')}</span>
              <span className="font-semibold text-base">{format(d, 'd')}</span>
              <div className="flex gap-1">
                {dayShiftCount > 0 && (
                  <span className={`text-[10px] ${active ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>{dayShiftCount} shifts</span>
                )}
                {dayTourCount > 0 && (
                  <span className="text-[10px] text-teal-400">{dayTourCount} 🏝️</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0 overflow-x-auto">
          <div style={{ minWidth: '900px' }}>
            <TimelineHeader />
            <ToursSummaryRow dateStr={selectedDateStr} />
            {employees.map(emp => (
              <TimelineRow key={emp.id} emp={emp} dateStr={selectedDateStr} />
            ))}
            {employees.length === 0 && (
              <div className="p-6 text-center font-body text-sm text-muted-foreground">No active employees found</div>
            )}
          </div>
        </CardContent>
      </Card>

      <ShiftModal shiftModal={shiftModal} shiftForm={shiftForm} setShiftForm={setShiftForm}
        employees={employees} weekDates={weekDates} saveShift={saveShift} addBrokenShift={addBrokenShift}
        onClose={() => setShiftModal(null)}
        onDelete={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { setShiftModal(null); setDeleteId(shiftModal.schedule!.id); } : undefined}
        onDuplicate={shiftModal?.mode === 'edit' && shiftModal.schedule ? () => { duplicateShift(shiftModal.schedule!); setShiftModal(null); } : undefined} />

      <DeleteConfirm deleteId={deleteId} setDeleteId={setDeleteId} onConfirm={confirmDelete} />

      {/* Task detail */}
      <Dialog open={!!viewingTask} onOpenChange={() => setViewingTask(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Task Details</DialogTitle>
          </DialogHeader>
          {viewingTask && <TaskDetailContent task={viewingTask} />}
        </DialogContent>
      </Dialog>

      {/* HK detail */}
      <Dialog open={!!viewingHk} onOpenChange={() => setViewingHk(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Housekeeping Details</DialogTitle>
          </DialogHeader>
          {viewingHk && <HkDetailContent order={viewingHk} />}
        </DialogContent>
      </Dialog>

      <TaskAssignModal open={taskModal} onClose={() => setTaskModal(false)} form={taskForm} setForm={setTaskForm}
        employees={employees} units={units} onSave={saveTask} />

      <EditTaskModal open={!!editingTask} onClose={() => setEditingTask(null)} form={editTaskForm} setForm={setEditTaskForm}
        employees={employees} onSave={saveEditTask} />

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-foreground">Delete Task?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-muted-foreground">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-display text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTask} className="font-display text-xs bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Shift Add/Edit Modal
const ShiftModal = ({ shiftModal, shiftForm, setShiftForm, employees, weekDates, saveShift, addBrokenShift, onClose, onDelete, onDuplicate }: {
  shiftModal: any; shiftForm: any; setShiftForm: any; employees: Employee[]; weekDates: Date[];
  saveShift: (keepOpen?: boolean) => void; addBrokenShift: () => void; onClose: () => void; onDelete?: () => void; onDuplicate?: () => void;
}) => {
  const isAdd = shiftModal?.mode === 'add';
  const selectedDays: string[] = shiftForm.selected_days || [];
  const selectedEmps: string[] = shiftForm.selected_employees || [];
  const allEmpsChecked = employees.length > 0 && employees.every(e => selectedEmps.includes(e.id));

  // Month calendar state - default to current month
  const [calMonth, setCalMonth] = useState(() => new Date());

  // Generate all days of the displayed month
  const monthDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    // Pad start to align with day-of-week grid
    const startPad = firstDay.getDay(); // 0=Sun
    return { days, startPad, year, month };
  }, [calMonth]);

  const toggleDay = (dateStr: string) => {
    setShiftForm((p: any) => {
      const days = p.selected_days || [];
      return { ...p, selected_days: days.includes(dateStr) ? days.filter((d: string) => d !== dateStr) : [...days, dateStr] };
    });
  };

  const toggleEmp = (empId: string) => {
    setShiftForm((p: any) => {
      const emps = p.selected_employees || [];
      const next = emps.includes(empId) ? emps.filter((id: string) => id !== empId) : [...emps, empId];
      return { ...p, selected_employees: next, employee_id: next[0] || '' };
    });
  };

  const toggleAllEmps = () => {
    if (allEmpsChecked) {
      setShiftForm((p: any) => ({ ...p, selected_employees: [], employee_id: '' }));
    } else {
      const all = employees.map(e => e.id);
      setShiftForm((p: any) => ({ ...p, selected_employees: all, employee_id: all[0] || '' }));
    }
  };

  // Quick-select helpers for day-of-week patterns
  const selectByDayOfWeek = (dow: number) => {
    const dates = monthDays.days.filter(d => d.getDay() === dow && d >= new Date(new Date().setHours(0,0,0,0)));
    const dateStrs = dates.map(d => format(d, 'yyyy-MM-dd'));
    setShiftForm((p: any) => {
      const existing = new Set(p.selected_days || []);
      const allAlreadySelected = dateStrs.every(d => existing.has(d));
      if (allAlreadySelected) {
        dateStrs.forEach(d => existing.delete(d));
      } else {
        dateStrs.forEach(d => existing.add(d));
      }
      return { ...p, selected_days: Array.from(existing) };
    });
  };

  const selectWeekdays = () => {
    const dates = monthDays.days.filter(d => d.getDay() >= 1 && d.getDay() <= 5 && d >= new Date(new Date().setHours(0,0,0,0)));
    const dateStrs = dates.map(d => format(d, 'yyyy-MM-dd'));
    setShiftForm((p: any) => {
      const existing = new Set(p.selected_days || []);
      const allAlreadySelected = dateStrs.every(d => existing.has(d));
      if (allAlreadySelected) {
        dateStrs.forEach(d => existing.delete(d));
      } else {
        dateStrs.forEach(d => existing.add(d));
      }
      return { ...p, selected_days: Array.from(existing) };
    });
  };

  const selectAllMonth = () => {
    const dates = monthDays.days.filter(d => d >= new Date(new Date().setHours(0,0,0,0)));
    const dateStrs = dates.map(d => format(d, 'yyyy-MM-dd'));
    setShiftForm((p: any) => {
      const existing = new Set(p.selected_days || []);
      const allAlreadySelected = dateStrs.every(d => existing.has(d));
      return { ...p, selected_days: allAlreadySelected ? [] : dateStrs };
    });
  };

  const clearDays = () => {
    setShiftForm((p: any) => ({ ...p, selected_days: [] }));
  };

  // This-week shortcut
  const selectThisWeek = () => {
    const dateStrs = weekDates.map(d => format(d, 'yyyy-MM-dd'));
    setShiftForm((p: any) => {
      const existing = new Set(p.selected_days || []);
      const allAlreadySelected = dateStrs.every(d => existing.has(d));
      if (allAlreadySelected) {
        dateStrs.forEach(d => existing.delete(d));
      } else {
        dateStrs.forEach(d => existing.add(d));
      }
      return { ...p, selected_days: Array.from(existing) };
    });
  };

  const totalShifts = isAdd ? (selectedEmps.length || (shiftForm.employee_id ? 1 : 0)) * (selectedDays.length || 1) : 1;
  const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DOW_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Dialog open={!!shiftModal} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">{isAdd ? 'Add Shifts' : 'Edit Shift'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* EMPLOYEES */}
          {isAdd ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="font-body text-xs text-muted-foreground">Employees</Label>
                <button onClick={toggleAllEmps} className="font-body text-[10px] text-accent hover:underline">
                  {allEmpsChecked ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 max-h-[100px] overflow-y-auto">
                {employees.map(e => {
                  const checked = selectedEmps.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => toggleEmp(e.id)}
                      className={`flex items-center gap-1.5 py-1.5 px-2 rounded text-xs font-body transition-colors border truncate
                        ${checked
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:bg-secondary/80'
                        }`}
                    >
                      <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                        {checked && <Check className="h-2 w-2 text-primary-foreground" />}
                      </div>
                      <span className="truncate">{e.name}</span>
                    </button>
                  );
                })}
              </div>
              {selectedEmps.length > 0 && (
                <p className="font-body text-[10px] text-muted-foreground mt-1">{selectedEmps.length} employee(s)</p>
              )}
            </div>
          ) : (
            <div>
              <Label className="font-body text-xs text-muted-foreground">Employee</Label>
              <Select value={shiftForm.employee_id} onValueChange={v => setShiftForm((p: any) => ({ ...p, employee_id: v }))}>
                <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {employees.map(e => <SelectItem key={e.id} value={e.id} className="font-body text-foreground">{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DAYS - CALENDAR */}
          {isAdd ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="font-body text-xs text-muted-foreground">Days ({selectedDays.length} selected)</Label>
                {selectedDays.length > 0 && (
                  <button onClick={clearDays} className="font-body text-[10px] text-destructive hover:underline">Clear</button>
                )}
              </div>

              {/* Quick-select row */}
              <div className="flex gap-1 mb-2 flex-wrap">
                <Button size="sm" variant="outline" className="font-body text-[10px] h-7 px-2" onClick={selectThisWeek}>This Week</Button>
                <Button size="sm" variant="outline" className="font-body text-[10px] h-7 px-2" onClick={selectWeekdays}>Mon–Fri</Button>
                <Button size="sm" variant="outline" className="font-body text-[10px] h-7 px-2" onClick={selectAllMonth}>Whole Month</Button>
                {DOW_FULL.map((label, i) => (
                  <Button key={i} size="sm" variant="outline" className="font-body text-[10px] h-7 px-1.5" onClick={() => selectByDayOfWeek(i)}>
                    {label}s
                  </Button>
                ))}
              </div>

              {/* Month nav */}
              <div className="flex items-center justify-between mb-1">
                <button onClick={() => setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="p-1 hover:bg-secondary rounded text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-body text-xs font-semibold text-foreground">
                  {format(calMonth, 'MMMM yyyy')}
                </span>
                <button onClick={() => setCalMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="p-1 hover:bg-secondary rounded text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {DOW_LABELS.map((d, i) => (
                  <div key={i} className="text-center font-body text-[9px] text-muted-foreground py-0.5">{d}</div>
                ))}
                {/* Empty padding cells */}
                {Array.from({ length: monthDays.startPad }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {monthDays.days.map(d => {
                  const dateStr = format(d, 'yyyy-MM-dd');
                  const checked = selectedDays.includes(dateStr);
                  const today = isToday(d);
                  const past = d < new Date(new Date().setHours(0,0,0,0));
                  return (
                    <button
                      key={dateStr}
                      onClick={() => !past && toggleDay(dateStr)}
                      disabled={past}
                      className={`py-1 rounded text-xs font-body transition-colors
                        ${past ? 'text-muted-foreground/30 cursor-not-allowed' :
                          checked ? 'bg-accent text-accent-foreground font-semibold' :
                          today ? 'bg-accent/15 text-accent' :
                          'hover:bg-secondary text-foreground'
                        }`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <Label className="font-body text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={shiftForm.schedule_date}
                onChange={e => setShiftForm((p: any) => ({ ...p, schedule_date: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body" />
            </div>
          )}

          {/* PRESETS & TIME */}
          <div className="flex gap-2">
            {PRESETS.map(p => (
              <Button key={p.label} size="sm" variant="outline" className="flex-1 font-body text-xs"
                onClick={() => setShiftForm((prev: any) => ({ ...prev, time_in: p.time_in, time_out: p.time_out }))}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="font-body text-xs text-muted-foreground">Time In</Label>
              <Input type="time" value={shiftForm.time_in}
                onChange={e => setShiftForm((p: any) => ({ ...p, time_in: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body" />
            </div>
            <div>
              <Label className="font-body text-xs text-muted-foreground">Time Out</Label>
              <Input type="time" value={shiftForm.time_out}
                onChange={e => setShiftForm((p: any) => ({ ...p, time_out: e.target.value }))}
                className="bg-secondary border-border text-foreground font-body" />
            </div>
          </div>
        </div>
        {shiftModal?.mode === 'edit' && onDelete && (
          <Button variant="destructive" className="w-full font-display text-xs min-h-[44px]" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete This Shift
          </Button>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="font-display text-xs" onClick={onClose}>Cancel</Button>
          <Button variant="outline" className="font-display text-xs" onClick={addBrokenShift}>
            <Clock className="h-3.5 w-3.5 mr-1" /> Broken
          </Button>
          {onDuplicate && (
            <Button variant="outline" className="font-display text-xs" onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Dup
            </Button>
          )}
          {isAdd && (
            <Button variant="outline" className="flex-1 font-display text-xs" onClick={() => saveShift(true)}>
              Save & More
            </Button>
          )}
          <Button className="flex-1 font-display text-xs" onClick={() => saveShift(false)}>
            {isAdd && totalShifts > 1 ? `Save (${totalShifts})` : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Delete Confirmation
const DeleteConfirm = ({ deleteId, setDeleteId, onConfirm }: { deleteId: string | null; setDeleteId: (v: string | null) => void; onConfirm: (id: string) => void }) => {
  const idRef = useRef<string | null>(null);
  useEffect(() => { if (deleteId) idRef.current = deleteId; }, [deleteId]);
  return (
    <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-foreground">Delete Shift?</AlertDialogTitle>
          <AlertDialogDescription className="font-body text-muted-foreground">
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-display text-xs">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (idRef.current) onConfirm(idRef.current); }} className="font-display text-xs bg-destructive text-destructive-foreground">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Task Assignment Modal
const TaskAssignModal = ({ open, onClose, form, setForm, employees, units, onSave }: {
  open: boolean; onClose: () => void;
  form: { employee_id: string; task_type: string; title: string; description: string; due_date: string; due_time: string; unit_name: string };
  setForm: (fn: any) => void; employees: Employee[];
  units: { id: string; unit_name: string }[]; onSave: () => void;
}) => (
  <Dialog open={open} onOpenChange={() => onClose()}>
    <DialogContent className="bg-card border-border max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-display text-foreground">Assign Task</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="font-body text-xs text-muted-foreground">Employee</Label>
          <Select value={form.employee_id} onValueChange={v => setForm((p: any) => ({ ...p, employee_id: v }))}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {employees.map(e => <SelectItem key={e.id} value={e.id} className="font-body text-foreground">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-body text-xs text-muted-foreground">Task Type</Label>
          <div className="flex gap-2 mt-1">
            {(['housecleaning', 'reception', 'custom'] as const).map(t => (
              <Button key={t} size="sm" variant={form.task_type === t ? 'default' : 'outline'}
                className="flex-1 font-body text-xs capitalize"
                onClick={() => setForm((p: any) => ({
                  ...p, task_type: t,
                  title: t === 'housecleaning' ? '' : t === 'reception' ? 'Reception duty' : p.title,
                }))}>
                {t === 'housecleaning' ? '🧹 Clean' : t === 'reception' ? '🛎️ Reception' : '📋 Custom'}
              </Button>
            ))}
          </div>
        </div>
        {form.task_type === 'housecleaning' && (
          <div>
            <Label className="font-body text-xs text-muted-foreground">Room / Unit</Label>
            <Select value={form.unit_name} onValueChange={v => setForm((p: any) => ({ ...p, unit_name: v }))}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {units.map(u => <SelectItem key={u.id} value={u.unit_name} className="font-body text-foreground">{u.unit_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {form.task_type !== 'housecleaning' && (
          <div>
            <Label className="font-body text-xs text-muted-foreground">Title</Label>
            <Input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body" placeholder="Task title" />
          </div>
        )}
        <div>
          <Label className="font-body text-xs text-muted-foreground">Notes</Label>
          <Textarea value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))}
            className="bg-secondary border-border text-foreground font-body min-h-[60px]" placeholder="Optional notes" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="font-body text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm((p: any) => ({ ...p, due_date: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body" />
          </div>
          <div>
            <Label className="font-body text-xs text-muted-foreground">Time</Label>
            <Input type="time" value={form.due_time} onChange={e => setForm((p: any) => ({ ...p, due_time: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1 font-display text-xs" onClick={onClose}>Cancel</Button>
        <Button className="flex-1 font-display text-xs" onClick={onSave}>Assign</Button>
      </div>
    </DialogContent>
  </Dialog>
);

// Edit Task Modal
const EditTaskModal = ({ open, onClose, form, setForm, employees, onSave }: {
  open: boolean; onClose: () => void;
  form: { title: string; description: string; due_date: string; due_time: string; employee_id: string };
  setForm: (fn: any) => void; employees: Employee[]; onSave: () => void;
}) => (
  <Dialog open={open} onOpenChange={() => onClose()}>
    <DialogContent className="bg-card border-border max-w-sm">
      <DialogHeader>
        <DialogTitle className="font-display text-foreground">Edit Task</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="font-body text-xs text-muted-foreground">Assigned To</Label>
          <Select value={form.employee_id} onValueChange={v => setForm((p: any) => ({ ...p, employee_id: v }))}>
            <SelectTrigger className="bg-secondary border-border text-foreground font-body"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {employees.map(e => <SelectItem key={e.id} value={e.id} className="font-body text-foreground">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-body text-xs text-muted-foreground">Title</Label>
          <Input value={form.title} onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
            className="bg-secondary border-border text-foreground font-body" />
        </div>
        <div>
          <Label className="font-body text-xs text-muted-foreground">Description</Label>
          <Textarea value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))}
            className="bg-secondary border-border text-foreground font-body min-h-[60px]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="font-body text-xs text-muted-foreground">Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm((p: any) => ({ ...p, due_date: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body" />
          </div>
          <div>
            <Label className="font-body text-xs text-muted-foreground">Time</Label>
            <Input type="time" value={form.due_time} onChange={e => setForm((p: any) => ({ ...p, due_time: e.target.value }))}
              className="bg-secondary border-border text-foreground font-body" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1 font-display text-xs" onClick={onClose}>Cancel</Button>
        <Button className="flex-1 font-display text-xs" onClick={onSave}>Save</Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default WeeklyScheduleManager;
