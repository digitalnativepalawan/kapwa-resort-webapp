import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import StaffNavBar from '@/components/StaffNavBar';
import { AlertTriangle, Loader2, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Maintenance work screen.
 *
 * Maintenance existed as a role in StaffAccessManager (`tasks:edit`,
 * `rooms:view`, …) and as a badge colour in StaffNavBar, but had no home
 * screen and no route. StaffShell only knew about reception / housekeeping /
 * kitchen / bar / experiences / orders, so a maintenance-only employee matched
 * no department and the shell fell through to rendering Reception.
 *
 * Work items are `employee_tasks` rows, which is what WeeklyScheduleManager and
 * EmployeePortal already assign against — maintenance staff can now see and
 * close the same tasks the office assigns them.
 */

interface MaintenanceTask {
  id: string;
  employee_id: string;
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

type Filter = 'open' | 'completed';

function isOverdue(task: MaintenanceTask): boolean {
  if (!task.due_date || task.status === 'completed') return false;
  return new Date(task.due_date).getTime() < Date.now();
}

const MaintenancePage = ({ embedded = false }: { embedded?: boolean }) => {
  const qc = useQueryClient();
  const { perms, isAdmin, canEdit } = usePermissions();
  const employeeId = typeof window !== 'undefined' ? localStorage.getItem('emp_id') : null;
  const mayEdit = isAdmin || canEdit('tasks');

  const [filter, setFilter] = useState<Filter>('open');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [adding, setAdding] = useState(false);

  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<MaintenanceTask[]>({
    queryKey: ['maintenance-tasks', filter, employeeId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('employee_tasks')
        .select('id, employee_id, title, description, status, due_date, completed_at, created_at')
        .is('archived_at', null)
        .order('due_date', { ascending: true, nullsFirst: false });

      query = filter === 'open'
        ? query.neq('status', 'completed')
        : query.eq('status', 'completed');

      // Maintenance staff see their own queue; admins see the whole board.
      if (!isAdmin && employeeId) query = query.eq('employee_id', employeeId);

      const { data, error: queryError } = await query;
      // Errors used to be dropped here, which is how a permission failure
      // rendered as "no work today" instead of telling anyone something broke.
      if (queryError) throw queryError;
      return (data ?? []) as MaintenanceTask[];
    },
    refetchInterval: 30000,
  });

  const { open, overdue } = useMemo(() => ({
    open: tasks.filter(t => t.status !== 'completed').length,
    overdue: tasks.filter(isOverdue).length,
  }), [tasks]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error: updateError } = await supabase
        .from('employee_tasks')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-tasks'] });
    },
    onError: (mutationError: unknown) => {
      toast.error(
        `Could not update the job: ${mutationError instanceof Error ? mutationError.message : 'unknown error'}`,
      );
    },
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('No employee is signed in on this device.');
      const { error: insertError } = await supabase.from('employee_tasks').insert({
        employee_id: employeeId,
        title: title.trim(),
        description: details.trim(),
        status: 'pending',
        created_by: 'maintenance',
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setTitle('');
      setDetails('');
      setAdding(false);
      toast.success('Job logged');
      qc.invalidateQueries({ queryKey: ['maintenance-tasks'] });
    },
    onError: (mutationError: unknown) => {
      toast.error(
        `Could not log the job: ${mutationError instanceof Error ? mutationError.message : 'unknown error'}`,
      );
    },
  });

  const body = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display text-sm tracking-wider text-foreground">MAINTENANCE</h2>
        </div>
        <div className="flex items-center gap-2">
          {overdue > 0 && <Badge variant="destructive">{overdue} overdue</Badge>}
          <Badge variant="secondary">{open} open</Badge>
        </div>
      </div>

      <div className="flex gap-1">
        {(['open', 'completed'] as Filter[]).map(value => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`font-display text-xs tracking-wider min-h-[40px] px-4 py-2 rounded-md border transition-colors ${
              filter === value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {value === 'open' ? 'Open' : 'Completed'}
          </button>
        ))}
      </div>

      {/* A failed read is reported, not swallowed into an empty list. */}
      {error && (
        <Card className="p-4 border-destructive/50 bg-destructive/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-body text-sm text-foreground">
                Could not load maintenance jobs.
              </p>
              <p className="font-body text-xs text-muted-foreground break-words">
                {error instanceof Error ? error.message : String(error)}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                Try again
              </Button>
            </div>
          </div>
        </Card>
      )}

      {mayEdit && (
        adding ? (
          <Card className="p-4 space-y-3">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs fixing?"
              maxLength={200}
            />
            <Textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Where is it, and what did you find? (optional)"
              rows={3}
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => addTask.mutate()}
                disabled={!title.trim() || addTask.isPending}
              >
                {addTask.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
                Log job
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </Card>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />Log a job
          </Button>
        )
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && !error && tasks.length === 0 && (
        <p className="font-body text-sm text-muted-foreground py-6 text-center">
          {filter === 'open' ? 'No open maintenance jobs.' : 'Nothing completed yet.'}
        </p>
      )}

      <div className="space-y-2">
        {tasks.map(task => (
          <Card key={task.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body text-sm text-foreground break-words">{task.title}</p>
                {task.description && (
                  <p className="font-body text-xs text-muted-foreground break-words mt-1">
                    {task.description}
                  </p>
                )}
              </div>
              {isOverdue(task) && <Badge variant="destructive" className="shrink-0">Overdue</Badge>}
            </div>

            {task.due_date && (
              <p className="font-body text-xs text-muted-foreground">
                Due {new Date(task.due_date).toLocaleDateString()}
              </p>
            )}

            {mayEdit && task.status !== 'completed' && (
              <div className="flex gap-2">
                {task.status !== 'in_progress' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus.mutate({ id: task.id, status: 'in_progress' })}
                    disabled={setStatus.isPending}
                  >
                    Start
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setStatus.mutate({ id: task.id, status: 'completed' })}
                  disabled={setStatus.isPending}
                >
                  Mark done
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen bg-navy-texture overflow-x-hidden">
      <StaffNavBar activeDepartment="maintenance" />
      <div className="max-w-2xl mx-auto px-4 pb-4">{body}</div>
    </div>
  );
};

export default MaintenancePage;
