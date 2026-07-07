import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Check, CheckCircle2, Pencil, Trash2, X, MessageCircle, Phone, Users, Eye, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { sendMessengerMessage, openWhatsApp } from '@/lib/messenger';
import { useResortProfile } from '@/hooks/useResortProfile';
import TaskCompletionPanel from './TaskCompletionPanel';
import TaskDetailSheet from './TaskDetailSheet';

interface Props {
  employeeId?: string;
  createdBy?: 'admin' | 'employee';
  readOnly?: boolean;
  employees?: { id: string; name: string; messenger_link?: string; whatsapp_number?: string; active?: boolean; display_name?: string; preferred_contact_method?: string }[];
}

const EmployeeTaskList = ({ employeeId, createdBy = 'admin', readOnly = false, employees = [] }: Props) => {
  const qc = useQueryClient();
  const { data: resortProfile } = useResortProfile();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignees, setAssignees] = useState<string[]>(employeeId ? [employeeId] : []);
  const [selectAll, setSelectAll] = useState(false);
  const [sendVia, setSendVia] = useState<'whatsapp' | 'messenger' | 'none'>('whatsapp');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDue, setEditDue] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'archived'>('all');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<any>(null);

  const activeEmployees = employees.filter(e => e.active !== false);

  const { data: tasks = [] } = useQuery({
    queryKey: ['employee-tasks', employeeId, filter],
    queryFn: async () => {
      let q = (supabase.from('employee_tasks' as any) as any).select('*').order('created_at', { ascending: false });
      if (employeeId) q = q.eq('employee_id', employeeId);
      if (filter === 'archived') {
        q = q.not('archived_at', 'is', null);
      } else {
        q = q.is('archived_at', null);
      }
      const { data } = await q;
      return (data || []) as any[];
    },
  });

  // Fetch comment counts for all tasks
  const taskIds = tasks.map((t: any) => t.id);
  const { data: commentCounts = {} } = useQuery({
    queryKey: ['task-comment-counts', taskIds.join(',')],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data } = await (supabase.from('task_comments' as any) as any)
        .select('task_id')
        .in('task_id', taskIds);
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => {
        counts[c.task_id] = (counts[c.task_id] || 0) + 1;
      });
      return counts;
    },
    enabled: taskIds.length > 0,
  });

  const filtered = tasks.filter(t => {
    if (filter === 'archived') return true;
    if (filter === 'pending') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  // Sort: pending first, completed last
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return 0;
  });

  const toggleAssignee = (id: string) => {
    setAssignees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSelectAll(false);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setAssignees(checked ? activeEmployees.map(e => e.id) : []);
  };

  const getStaffName = () => {
    if (employeeId) {
      const emp = employees.find(e => e.id === employeeId);
      return emp?.display_name || emp?.name || 'Staff';
    }
    return createdBy === 'employee' ? 'Staff' : 'Admin';
  };

  const bulkSendMessages = (targetIds: string[], taskTitle: string, taskDesc: string, taskDue: string, method: 'whatsapp' | 'messenger' | 'none') => {
    if (method === 'none') return;
    let sent = 0;
    let skipped = 0;

    targetIds.forEach((empId, idx) => {
      const emp = employees.find(e => e.id === empId);
      if (!emp || emp.active === false) { skipped++; return; }

      const displayName = emp.display_name || emp.name;
      const due = taskDue ? `\nDue: ${format(new Date(taskDue), 'MMM d, h:mm a')}` : '';
      const msg = `Hi ${displayName},\n\nTask: ${taskTitle}${taskDesc ? '\n' + taskDesc : ''}${due}\n\n— ${resortProfile?.resort_name || 'Resort'} Admin`;

      if (method === 'whatsapp' && emp.whatsapp_number) {
        setTimeout(() => openWhatsApp(emp.whatsapp_number!, msg), idx * 800);
        sent++;
      } else if (method === 'messenger' && emp.messenger_link) {
        setTimeout(() => sendMessengerMessage(
          { name: emp.name, display_name: emp.display_name, messenger_link: emp.messenger_link!, active: true },
          `Task: ${taskTitle}${taskDesc ? '\n' + taskDesc : ''}${due}`,
          resortProfile?.resort_name || 'Resort'
        ), idx * 800);
        sent++;
      } else {
        skipped++;
      }
    });

    if (sent > 0) toast.success(`${method === 'whatsapp' ? '📱' : '💬'} Sending to ${sent} staff member${sent > 1 ? 's' : ''}`);
    if (skipped > 0) toast.info(`${skipped} skipped (no ${method} configured)`);
  };

  const addTask = async () => {
    const targetIds = employeeId ? [employeeId] : (selectAll ? activeEmployees.map(e => e.id) : assignees);
    if (!title.trim() || targetIds.length === 0) return;

    const rows = targetIds.map(empId => ({
      employee_id: empId,
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      created_by: createdBy,
    }));

    await (supabase.from('employee_tasks' as any) as any).insert(rows);

    const savedTitle = title.trim();
    const savedDesc = description.trim();
    const savedDue = dueDate;
    const count = targetIds.length;

    setTitle(''); setDescription(''); setDueDate(''); setShowForm(false);
    if (!employeeId) { setAssignees([]); setSelectAll(false); }
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success(`Task added to ${count} staff member${count > 1 ? 's' : ''}`);

    bulkSendMessages(targetIds, savedTitle, savedDesc, savedDue, sendVia);
  };

  const handleCompleteConfirm = async (task: any, comment: string, imageUrl: string) => {
    const completionMeta = {
      completed_by: getStaffName(),
      comment: comment.trim() || null,
      image_url: imageUrl || null,
    };
    await (supabase.from('employee_tasks' as any) as any).update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_meta: completionMeta,
    }).eq('id', task.id);
    setCompletingTaskId(null);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task completed ✔');
  };

  const toggleComplete = async (task: any) => {
    if (task.status === 'completed') {
      // Uncomplete
      await (supabase.from('employee_tasks' as any) as any).update({
        status: 'pending',
        completed_at: null,
        completion_meta: {},
      }).eq('id', task.id);
      qc.invalidateQueries({ queryKey: ['employee-tasks'] });
      toast.success('Task reopened');
    } else {
      // Open completion panel
      setCompletingTaskId(task.id);
    }
  };

  const saveEdit = async () => {
    if (!editId || !editTitle.trim()) return;
    await (supabase.from('employee_tasks' as any) as any).update({
      title: editTitle.trim(),
      description: editDesc.trim(),
      due_date: editDue ? new Date(editDue).toISOString() : null,
    }).eq('id', editId);
    setEditId(null);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task updated');
  };

  const archiveTask = async (id: string) => {
    await (supabase.from('employee_tasks' as any) as any).update({ archived_at: new Date().toISOString() }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task archived');
  };

  const restoreTask = async (id: string) => {
    await (supabase.from('employee_tasks' as any) as any).update({ archived_at: null }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['employee-tasks'] });
    toast.success('Task restored');
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp?.display_name || emp?.name || '';
  };

  return (
    <div className="space-y-3">
      {/* Filter + Add */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'pending', 'completed', 'archived'] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)} className="font-body text-xs flex-1 capitalize">{f}</Button>
        ))}
      </div>
      {!readOnly && (
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}
          className="font-display text-xs tracking-wider gap-1 w-full">
          <Plus className="w-3.5 h-3.5" /> Add Task
        </Button>
      )}

      {showForm && (
        <div className="border border-primary/30 rounded-lg p-3 space-y-2">
          {/* Multi-select assignees */}
          {!employeeId && activeEmployees.length > 0 && (
            <div className="space-y-1.5">
              <label className="font-body text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> Assign to
              </label>
              {assignees.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectAll ? (
                    <Badge variant="default" className="font-body text-xs">All Staff ({activeEmployees.length})</Badge>
                  ) : (
                    assignees.map(id => (
                      <Badge key={id} variant="secondary" className="font-body text-xs gap-1">
                        {getEmployeeName(id)}
                        <X className="w-3 h-3 cursor-pointer" onClick={() => toggleAssignee(id)} />
                      </Badge>
                    ))
                  )}
                </div>
              )}
              <div className="border border-border rounded-md p-2 max-h-36 overflow-y-auto space-y-1.5 bg-secondary">
                <label className="flex items-center gap-2 cursor-pointer font-body text-sm font-semibold text-foreground">
                  <Checkbox checked={selectAll} onCheckedChange={(c) => handleSelectAll(!!c)} />
                  All Staff
                </label>
                <div className="border-t border-border my-1" />
                {activeEmployees.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 cursor-pointer font-body text-sm text-foreground">
                    <Checkbox
                      checked={assignees.includes(emp.id)}
                      onCheckedChange={() => toggleAssignee(emp.id)}
                    />
                    <span className="flex-1">{emp.display_name || emp.name}</span>
                    {emp.whatsapp_number && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-500 bg-green-500/10 rounded px-1 py-0.5">
                        <Phone className="w-2.5 h-2.5" /> WA
                      </span>
                    )}
                    {emp.messenger_link && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-500 bg-blue-500/10 rounded px-1 py-0.5">
                        <MessageCircle className="w-2.5 h-2.5" /> MSG
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title"
            className="bg-secondary border-border text-foreground font-body text-sm" />
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            className="bg-secondary border-border text-foreground font-body text-sm" />
          <div>
            <label className="font-body text-xs text-muted-foreground">Due date & time</label>
            <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="bg-secondary border-border text-foreground font-body text-sm" />
          </div>
          <div className="space-y-1">
            <label className="font-body text-xs text-muted-foreground">Send via</label>
            <div className="flex gap-1">
              {(['whatsapp', 'messenger', 'none'] as const).map(m => (
                <Button key={m} size="sm" type="button"
                  variant={sendVia === m ? 'default' : 'outline'}
                  onClick={() => setSendVia(m)}
                  className="font-body text-xs flex-1 capitalize">
                  {m === 'none' ? 'Don\'t send' : m === 'whatsapp' ? '📱 WhatsApp' : '💬 Messenger'}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTask} className="font-display text-xs tracking-wider flex-1"
              disabled={!title.trim() || (!employeeId && assignees.length === 0)}>
              {assignees.length > 1 || selectAll ? `Send to ${selectAll ? activeEmployees.length : assignees.length} staff` : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && <p className="font-body text-xs text-muted-foreground text-center py-4">No tasks</p>}

      {sorted.map(task => {
        const isCompleted = task.status === 'completed';
        const meta = task.completion_meta || {};
        const isCompleting = completingTaskId === task.id;

        return (
          <div key={task.id} className={`border rounded-lg p-3 space-y-2 transition-all ${isCompleted ? 'border-green-500/30 bg-green-500/5' : 'border-border'}`}>
            {editId === task.id ? (
              <div className="space-y-2">
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-secondary border-border text-foreground font-body text-sm" />
                <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="bg-secondary border-border text-foreground font-body text-sm" />
                <Input type="datetime-local" value={editDue} onChange={e => setEditDue(e.target.value)} className="bg-secondary border-border text-foreground font-body text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} className="font-display text-xs tracking-wider flex-1">Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)} className="font-display text-xs tracking-wider flex-1">Cancel</Button>
                </div>
              </div>
            ) : isCompleting ? (
              <TaskCompletionPanel
                taskTitle={task.title}
                onConfirm={(comment, imageUrl) => handleCompleteConfirm(task, comment, imageUrl)}
                onCancel={() => setCompletingTaskId(null)}
              />
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    {!employeeId && <p className="font-body text-xs text-primary">{getEmployeeName(task.employee_id)}</p>}

                    {isCompleted && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="font-display text-xs tracking-wider text-green-600">Completed</span>
                      </div>
                    )}

                    <p className={`font-body text-sm text-foreground ${isCompleted ? 'line-through opacity-60' : ''}`}>{task.title}</p>
                    {task.description && <p className="font-body text-xs text-muted-foreground">{task.description}</p>}

                    {/* Completion details inline */}
                    {isCompleted && (
                      <div className="mt-1.5 space-y-0.5">
                        {meta.completed_by && (
                          <p className="font-body text-xs text-muted-foreground">
                            By: <span className="text-foreground font-medium">{meta.completed_by}</span>
                          </p>
                        )}
                        {task.completed_at && (
                          <p className="font-body text-xs text-muted-foreground">
                            {format(new Date(task.completed_at), 'h:mm a — MMM d')}
                          </p>
                        )}
                        {meta.comment && (
                          <p className="font-body text-xs text-muted-foreground italic">"{meta.comment}"</p>
                        )}
                        {meta.image_url && (
                          <a href={meta.image_url} target="_blank" rel="noopener noreferrer">
                            <img src={meta.image_url} alt="proof" className="h-12 w-12 rounded object-cover border border-border mt-1" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {!readOnly && (
                      <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => toggleComplete(task)}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-7 h-7 text-green-500" />
                        ) : (
                          <Check className="w-5 h-5 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                    {readOnly && isCompleted && (
                      <CheckCircle2 className="w-7 h-7 text-green-500 mr-1" />
                    )}
                    {/* Details button for all tasks */}
                    <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground"
                      onClick={() => setDetailTask(task)} title="View details">
                      <Eye className="w-5 h-5" />
                    </Button>
                    {!readOnly && (
                      <>
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" onClick={() => {
                          setEditId(task.id); setEditTitle(task.title); setEditDesc(task.description || '');
                          setEditDue(task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : '');
                        }}><Pencil className="w-5 h-5" /></Button>
                        {filter === 'archived' ? (
                          <Button size="icon" variant="ghost" className="h-10 w-10 text-primary"
                            onClick={() => restoreTask(task.id)} title="Restore task"><Upload className="w-5 h-5" /></Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground hover:text-destructive"
                            onClick={() => archiveTask(task.id)} title="Archive task"><Trash2 className="w-5 h-5" /></Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground"
                          title="Send via Messenger"
                          disabled={(() => { const emp = employees.find(e => e.id === task.employee_id); return !emp?.messenger_link || emp?.active === false; })()}
                          onClick={() => {
                            const emp = employees.find(e => e.id === task.employee_id);
                            if (emp) sendMessengerMessage(
                              { name: emp.name, display_name: emp.display_name, messenger_link: emp.messenger_link || '', active: emp.active !== false },
                              `Task: ${task.title}${task.description ? '\n' + task.description : ''}`,
                              resortProfile?.resort_name || 'Resort'
                            );
                          }}>
                          <MessageCircle className="w-5 h-5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-10 w-10 text-green-600"
                          title="Send via WhatsApp"
                          disabled={(() => { const emp = employees.find(e => e.id === task.employee_id); return !emp?.whatsapp_number || emp?.active === false; })()}
                          onClick={() => {
                            const emp = employees.find(e => e.id === task.employee_id);
                            if (emp?.whatsapp_number) {
                              const displayName = emp.display_name || emp.name;
                              const due = task.due_date ? `\nDue: ${format(new Date(task.due_date), 'MMM d, h:mm a')}` : '';
                              const msg = `Hi ${displayName},\n\nTask: ${task.title}${task.description ? '\n' + task.description : ''}${due}\n\n— ${resortProfile?.resort_name || 'Resort'} Admin`;
                              openWhatsApp(emp.whatsapp_number, msg);
                            }
                          }}>
                          <Phone className="w-5 h-5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {!isCompleted && (
                  <div className="flex gap-2 items-center">
                    {task.due_date && (
                      <span className="font-body text-xs text-muted-foreground">
                        Due: {format(new Date(task.due_date), 'MMM d, h:mm a')}
                      </span>
                    )}
                    <Badge variant={task.status === 'in_progress' ? 'secondary' : 'outline'}
                      className="font-body text-xs capitalize">{task.status}</Badge>
                    <Badge variant="outline" className="font-body text-xs">{task.created_by}</Badge>
                    {(commentCounts as Record<string,number>)[task.id] > 0 && (
                      <span className="inline-flex items-center gap-0.5 font-body text-xs text-muted-foreground">
                        <MessageCircle className="w-3 h-3" /> {(commentCounts as Record<string,number>)[task.id]}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        open={!!detailTask}
        onOpenChange={(open) => { if (!open) setDetailTask(null); }}
        task={detailTask}
        employeeName={detailTask ? getEmployeeName(detailTask.employee_id) : undefined}
        authorName={getStaffName()}
        readOnly={readOnly}
      />
    </div>
  );
};

export default EmployeeTaskList;
