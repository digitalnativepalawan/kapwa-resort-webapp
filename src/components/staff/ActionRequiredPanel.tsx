import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { CheckCircle2, ChevronRight, Paperclip, AlertTriangle, Clock, ArrowRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SESSION_KEY = 'staff_home_session';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  employee_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  completion_meta: any | null;
  created_by: string;
}

interface Employee {
  id: string;
  name: string;
  display_name: string;
}

type UrgencyLevel = 'overdue' | 'today' | 'inprogress' | 'pending';

function getUrgency(task: Task): UrgencyLevel {
  if (task.status === 'in_progress') return 'inprogress';
  if (task.due_date) {
    const d = parseISO(task.due_date);
    if (isPast(d) && !isToday(d)) return 'overdue';
    if (isToday(d)) return 'today';
  }
  return 'pending';
}

const URGENCY_ORDER: Record<UrgencyLevel, number> = {
  overdue: 0,
  today: 1,
  inprogress: 2,
  pending: 3,
};

const urgencyConfig: Record<UrgencyLevel, { bar: string; label: string; labelClass: string; icon: React.ReactNode }> = {
  overdue: {
    bar: 'bg-destructive',
    label: 'Overdue',
    labelClass: 'text-destructive',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  today: {
    bar: 'bg-warning',
    label: 'Due today',
    labelClass: 'text-warning',
    icon: <Clock className="w-3 h-3" />,
  },
  inprogress: {
    bar: 'bg-primary',
    label: 'In progress',
    labelClass: 'text-primary',
    icon: <ArrowRight className="w-3 h-3" />,
  },
  pending: {
    bar: 'bg-muted-foreground/40',
    label: '',
    labelClass: 'text-muted-foreground',
    icon: null,
  },
};

const ActionRequiredPanel = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [loading, setLoading] = useState(true);
  const [currentEmpId, setCurrentEmpId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchTasks = async () => {
      // Read session
      let session: { permissions?: string[]; name?: string } | null = null;
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) session = JSON.parse(raw);
      } catch {}

      const empId = localStorage.getItem('emp_id');
      setCurrentEmpId(empId);
      const perms: string[] = session?.permissions || [];
      const isAdmin = perms.includes('admin');

      // Build query
      let query = supabase
        .from('employee_tasks')
        .select('*')
        .neq('status', 'completed')
        .is('archived_at', null);

      // Non-admins only see their own tasks
      if (!isAdmin && empId) {
        query = query.eq('employee_id', empId);
      }

      const { data: taskData } = await query;

      if (!taskData || taskData.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Sort by urgency then limit to 5
      const sorted = [...taskData]
        .sort((a, b) => URGENCY_ORDER[getUrgency(a)] - URGENCY_ORDER[getUrgency(b)])
        .slice(0, 5) as Task[];

      setTasks(sorted);

      // Fetch employee names for the visible tasks
      const empIds = [...new Set(sorted.map(t => t.employee_id))];

      // Fetch comment counts
      const taskIds = sorted.map(t => t.id);
      const [empResult, commentResult] = await Promise.all([
        empIds.length > 0
          ? supabase.from('employees').select('id, name, display_name').in('id', empIds)
          : Promise.resolve({ data: null }),
        taskIds.length > 0
          ? (supabase.from('task_comments' as any) as any).select('task_id').in('task_id', taskIds)
          : Promise.resolve({ data: null }),
      ]);

      if (empResult.data) {
        const map: Record<string, Employee> = {};
        empResult.data.forEach((e: any) => { map[e.id] = e as Employee; });
        setEmployees(map);
      }

      // Build comment count map
      const ccMap: Record<string, number> = {};
      (commentResult.data || []).forEach((c: any) => {
        ccMap[c.task_id] = (ccMap[c.task_id] || 0) + 1;
      });
      setCommentCounts(ccMap);

      setLoading(false);
    };

    fetchTasks();
  }, []);

  if (loading) return null;

  if (tasks.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
        <div>
          <p className="font-display text-xs tracking-wider text-foreground">All clear</p>
          <p className="font-body text-xs text-muted-foreground">No tasks require your attention</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xs tracking-widest text-muted-foreground uppercase">Action Required</h2>
        <button
          onClick={() => navigate('/employee-portal')}
          className="font-body text-xs text-primary flex items-center gap-0.5 hover:underline"
        >
          View All <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Task cards */}
      <div className="space-y-2">
        {tasks.map(task => {
          const urgency = getUrgency(task);
          const cfg = urgencyConfig[urgency];
          const emp = employees[task.employee_id];
          const empLabel = emp ? (emp.display_name || emp.name) : null;
          const hasAttachment = !!(task.completion_meta as Record<string,unknown> | null)?.['image_url'];
          const dueDateLabel = task.due_date && urgency === 'pending'
            ? `Due ${format(parseISO(task.due_date), 'MMM d')}`
            : '';

          return (
            <div
              key={task.id}
              className="relative flex overflow-hidden rounded-lg border border-border bg-card"
            >
              {/* Priority left bar */}
              <div className={`w-1 shrink-0 ${cfg.bar}`} />

              <div className="flex flex-1 items-center gap-3 px-3 py-3 min-w-0">
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-semibold text-foreground truncate leading-snug">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {empLabel && (
                      <span className="font-body text-xs text-muted-foreground">{empLabel}</span>
                    )}
                    {cfg.label && (
                      <span className={`font-body text-xs flex items-center gap-0.5 ${cfg.labelClass}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    )}
                    {dueDateLabel && (
                      <span className="font-body text-xs text-muted-foreground">{dueDateLabel}</span>
                    )}
                    {hasAttachment && (
                      <span className="text-muted-foreground">
                        <Paperclip className="w-3 h-3" />
                      </span>
                    )}
                    {commentCounts[task.id] > 0 && (
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <MessageCircle className="w-3 h-3" />
                        <span className="font-body text-[10px]">{commentCounts[task.id]}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Action button */}
                {(() => {
                  const isMyTask = task.employee_id === currentEmpId;
                  const buttonLabel = isMyTask
                    ? (task.status === 'in_progress' ? 'Continue' : 'Start Task')
                    : 'Manage';
                  const buttonVariant = !isMyTask
                    ? 'outline'
                    : urgency === 'overdue' ? 'destructive' : 'default';
                  return (
                    <Button
                      size="sm"
                      variant={buttonVariant}
                      className="shrink-0 font-display text-xs tracking-wide h-8 px-3"
                      onClick={() => navigate('/employee-portal')}
                    >
                      {buttonLabel}
                    </Button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActionRequiredPanel;
