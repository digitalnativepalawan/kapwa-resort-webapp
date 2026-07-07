import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Calendar, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import TaskCommentThread from './TaskCommentThread';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  employeeName?: string;
  authorName: string;
  readOnly?: boolean;
}

const TaskDetailSheet = ({ open, onOpenChange, task, employeeName, authorName, readOnly = false }: Props) => {
  const taskId = task?.id ?? null;
  const meta = task?.completion_meta || {};
  const isCompleted = task?.status === 'completed';

  // Fetch comment count for activity log
  const { data: commentCount = 0 } = useQuery({
    queryKey: ['task-comments-count', taskId],
    queryFn: async () => {
      const { count } = await (supabase.from('task_comments' as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);
      return count || 0;
    },
    enabled: open && !!taskId,
  });

  if (!task) return null;

  // Build activity timeline
  const activities: { label: string; time: string }[] = [
    { label: 'Task created', time: format(new Date(task.created_at), 'MMM d, h:mm a') },
  ];
  if (task.due_date) {
    activities.push({ label: `Due date set: ${format(new Date(task.due_date), 'MMM d, h:mm a')}`, time: '' });
  }
  if (isCompleted && task.completed_at) {
    activities.push({
      label: `Completed by ${meta.completed_by || 'Staff'}`,
      time: format(new Date(task.completed_at), 'MMM d, h:mm a'),
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="font-display text-base tracking-wider">Task Details</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Completion banner */}
          {isCompleted && (
            <div className="flex items-center gap-3 border border-green-500/30 rounded-lg p-3 bg-green-500/5">
              <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-display text-sm tracking-wider text-green-600">Completed</p>
                {meta.completed_by && (
                  <p className="font-body text-xs text-muted-foreground">By {meta.completed_by}</p>
                )}
                {task.completed_at && (
                  <p className="font-body text-xs text-muted-foreground">
                    {format(new Date(task.completed_at), 'MMM d, yyyy — h:mm a')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Task header */}
          <div>
            <p className={`font-body text-base text-foreground font-medium ${isCompleted ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="font-body text-sm text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>

          {/* Meta badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={isCompleted ? 'default' : 'outline'} className="font-body text-xs capitalize gap-1">
              {task.status}
            </Badge>
            {employeeName && (
              <Badge variant="secondary" className="font-body text-xs gap-1">
                <User className="w-3 h-3" /> {employeeName}
              </Badge>
            )}
            {task.due_date && (
              <Badge variant="outline" className="font-body text-xs gap-1">
                <Calendar className="w-3 h-3" /> {format(new Date(task.due_date), 'MMM d, h:mm a')}
              </Badge>
            )}
            <Badge variant="outline" className="font-body text-xs">{task.created_by}</Badge>
          </div>

          {/* Completion proof */}
          {isCompleted && (meta.comment || meta.image_url) && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Completion Note</p>
              {meta.comment && <p className="font-body text-sm text-foreground">"{meta.comment}"</p>}
              {meta.image_url && (
                <a href={meta.image_url} target="_blank" rel="noopener noreferrer">
                  <img src={meta.image_url} alt="proof" className="h-24 rounded object-cover border border-border" />
                </a>
              )}
            </div>
          )}

          {/* Activity log */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Activity</p>
            {activities.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="font-body text-xs text-foreground">{a.label}</span>
                {a.time && <span className="font-body text-[10px] text-muted-foreground ml-auto">{a.time}</span>}
              </div>
            ))}
            {commentCount > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="font-body text-xs text-foreground">{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Comment thread */}
          <div className="space-y-1.5">
            <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Comments</p>
            <TaskCommentThread taskId={task.id} authorName={authorName} readOnly={readOnly} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default TaskDetailSheet;
