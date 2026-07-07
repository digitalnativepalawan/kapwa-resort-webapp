import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, CheckCircle2, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImage } from '@/lib/imageCompress';

interface Props {
  taskTitle: string;
  onConfirm: (comment: string, imageUrl: string) => void;
  onCancel: () => void;
}

const TaskCompletionPanel = ({ taskTitle, onConfirm, onCancel }: Props) => {
  const [comment, setComment] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file, 800);
      const ext = compressed.name.split('.').pop();
      const path = `task-proof/${Date.now()}.${ext}`;
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

  return (
    <div className="border border-primary/30 rounded-lg p-3 space-y-2 bg-secondary/50">
      <p className="font-body text-xs text-muted-foreground">
        Completing: <span className="text-foreground font-medium">{taskTitle}</span>
      </p>
      <Textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Add a note (optional)"
        className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]"
        rows={2}
      />
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />
        <Button size="sm" variant="outline" type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="font-body text-xs gap-1">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {imageUrl ? 'Replace Photo' : 'Add Photo'}
        </Button>
        {imageUrl && (
          <img src={imageUrl} alt="proof" className="h-10 w-10 rounded object-cover border border-border" />
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => {
            if (!comment.trim()) { toast.error('Please add a completion note'); return; }
            onConfirm(comment, imageUrl);
          }}
          className="font-display text-xs tracking-wider flex-1 gap-1 bg-green-600 hover:bg-green-700 text-white">
          <CheckCircle2 className="w-4 h-4" /> Confirm Complete
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="font-display text-xs tracking-wider">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default TaskCompletionPanel;
