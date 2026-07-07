import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Camera, Link2, Loader2, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { compressImage } from '@/lib/imageCompress';

interface Comment {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  created_at: string;
}

interface Props {
  taskId: string;
  authorName: string;
  readOnly?: boolean;
  maxComments?: number;
  maxImages?: number;
}

const TaskCommentThread = ({ taskId, authorName, readOnly = false, maxComments = 10, maxImages = 3 }: Props) => {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const { data } = await (supabase.from('task_comments' as any) as any)
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      return (data || []) as Comment[];
    },
  });

  const imageCount = comments.filter(c => c.image_url).length + (imageUrl ? 1 : 0);
  const atCommentLimit = comments.length >= maxComments;
  const atImageLimit = imageCount >= maxImages;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (atImageLimit) { toast.error(`Max ${maxImages} images per task`); return; }
    setUploading(true);
    try {
      const compressed = await compressImage(file, 800);
      const ext = compressed.name.split('.').pop();
      const path = `task-comments/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('receipts').upload(path, compressed);
      if (error) throw error;
      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      toast.success('Image uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!text.trim() && !imageUrl) return;
    if (atCommentLimit) return;
    setSubmitting(true);
    try {
      await (supabase.from('task_comments' as any) as any).insert({
        task_id: taskId,
        author_name: authorName,
        content: text.trim(),
        image_url: imageUrl || null,
        link_url: linkUrl.trim() || null,
      });
      setText('');
      setImageUrl('');
      setLinkUrl('');
      setShowLink(false);
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Comment list */}
      {comments.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="border border-border rounded-md p-2.5 bg-secondary/50">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="font-display text-xs tracking-wider text-foreground font-semibold">{c.author_name}</span>
                <span className="font-body text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(new Date(c.created_at), 'MMM d, h:mm a')}
                </span>
              </div>
              {c.content && <p className="font-body text-sm text-foreground">{c.content}</p>}
              {c.image_url && (
                <a href={c.image_url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
                  <img src={c.image_url} alt="attachment" className="h-20 w-20 rounded object-cover border border-border" />
                </a>
              )}
              {c.link_url && (
                <a href={c.link_url} target="_blank" rel="noopener noreferrer"
                  className="font-body text-xs text-primary underline mt-1 block truncate">
                  {c.link_url}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add comment form */}
      {!readOnly && !atCommentLimit && (
        <div className="space-y-2 border-t border-border pt-2">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a comment..."
            className="bg-secondary border-border text-foreground font-body text-sm min-h-[50px]"
            rows={2}
          />

          {showLink && (
            <Input
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="bg-secondary border-border text-foreground font-body text-sm"
            />
          )}

          {imageUrl && (
            <div className="flex items-center gap-2">
              <img src={imageUrl} alt="attachment" className="h-10 w-10 rounded object-cover border border-border" />
              <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setImageUrl('')}>Remove</Button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => fileRef.current?.click()}
              disabled={uploading || atImageLimit} title={atImageLimit ? `Max ${maxImages} images` : 'Add photo'}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant={showLink ? 'default' : 'outline'} className="h-8 w-8"
              onClick={() => setShowLink(!showLink)} title="Add link">
              <Link2 className="w-3.5 h-3.5" />
            </Button>
            <div className="flex-1" />
            <Button size="sm" onClick={submit} disabled={submitting || (!text.trim() && !imageUrl)}
              className="font-display text-xs tracking-wider gap-1 h-8">
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </Button>
          </div>
        </div>
      )}

      {atCommentLimit && (
        <div className="flex items-center gap-1.5 text-muted-foreground py-1">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="font-body text-xs">Comment limit reached — contact admin if more updates are needed.</span>
        </div>
      )}
    </div>
  );
};

export default TaskCommentThread;
