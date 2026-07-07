import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface CompletionMeta {
  completed_by?: string;
  comment?: string;
  image_url?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  employeeName?: string;
}

const TaskDetailsModal = ({ open, onOpenChange, task, employeeName }: Props) => {
  if (!task) return null;
  const meta: CompletionMeta = task.completion_meta || {};
  const isCompleted = task.status === 'completed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base tracking-wider">Task Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className={`font-body text-sm text-foreground ${isCompleted ? 'line-through opacity-70' : ''}`}>{task.title}</p>
            {task.description && <p className="font-body text-xs text-muted-foreground mt-1">{task.description}</p>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant={isCompleted ? 'default' : 'outline'} className="font-body text-xs capitalize">{task.status}</Badge>
            <Badge variant="outline" className="font-body text-xs">{task.created_by}</Badge>
            {employeeName && <Badge variant="secondary" className="font-body text-xs">{employeeName}</Badge>}
          </div>

          {task.due_date && (
            <p className="font-body text-xs text-muted-foreground">
              Due: {format(new Date(task.due_date), 'MMM d, h:mm a')}
            </p>
          )}

          {isCompleted && (
            <div className="border border-green-500/30 rounded-lg p-3 bg-green-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-display text-xs tracking-wider text-green-600">Task Completed</span>
              </div>

              {meta.completed_by && (
                <p className="font-body text-sm text-foreground">
                  Completed by: <span className="font-semibold">{meta.completed_by}</span>
                </p>
              )}

              {task.completed_at && (
                <p className="font-body text-xs text-muted-foreground">
                  {format(new Date(task.completed_at), 'MMM d, h:mm a')}
                </p>
              )}

              {meta.comment && (
                <div className="border-t border-border pt-2">
                  <p className="font-body text-xs text-muted-foreground mb-0.5">Comment</p>
                  <p className="font-body text-sm text-foreground">"{meta.comment}"</p>
                </div>
              )}

              {meta.image_url && (
                <div className="border-t border-border pt-2">
                  <p className="font-body text-xs text-muted-foreground mb-1">Proof</p>
                  <a href={meta.image_url} target="_blank" rel="noopener noreferrer">
                    <img src={meta.image_url} alt="completion proof" className="w-full max-w-[200px] rounded-lg border border-border object-cover" />
                  </a>
                </div>
              )}
            </div>
          )}

          <p className="font-body text-xs text-muted-foreground">
            Created: {format(new Date(task.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal;
