import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X, ExternalLink, Globe, Lock, Monitor } from 'lucide-react';
import { format } from 'date-fns';

interface ITNote {
  id: string;
  name: string;
  urls: { label: string; url: string }[];
  comments: string;
  category: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['general', 'ai-tools', 'messaging', 'hosting', 'passwords', 'apis', 'other'];

const ITNotesSection = () => {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formComments, setFormComments] = useState('');
  const [formUrls, setFormUrls] = useState<{ label: string; url: string }[]>([]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['it-notes'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('it_notes' as any) as any)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ITNote[];
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormCategory('general');
    setFormComments('');
    setFormUrls([]);
    setAdding(false);
    setEditingId(null);
  };

  const startEdit = (note: ITNote) => {
    setEditingId(note.id);
    setFormName(note.name);
    setFormCategory(note.category);
    setFormComments(note.comments);
    setFormUrls(Array.isArray(note.urls) ? note.urls : []);
    setAdding(false);
  };

  const addUrl = () => {
    setFormUrls([...formUrls, { label: '', url: '' }]);
  };

  const updateUrl = (index: number, field: 'label' | 'url', value: string) => {
    const updated = [...formUrls];
    updated[index] = { ...updated[index], [field]: value };
    setFormUrls(updated);
  };

  const removeUrl = (index: number) => {
    setFormUrls(formUrls.filter((_, i) => i !== index));
  };

  const saveNote = async () => {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }
    const cleanUrls = formUrls.filter(u => u.url.trim());
    const payload = {
      name: formName.trim(),
      category: formCategory,
      comments: formComments.trim(),
      urls: cleanUrls,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await (supabase.from('it_notes' as any) as any)
        .update(payload).eq('id', editingId);
      if (error) { toast.error('Update failed'); return; }
      toast.success('Note updated');
    } else {
      const { error } = await (supabase.from('it_notes' as any) as any)
        .insert(payload);
      if (error) { toast.error('Save failed'); return; }
      toast.success('Note added');
    }
    qc.invalidateQueries({ queryKey: ['it-notes'] });
    resetForm();
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await (supabase.from('it_notes' as any) as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['it-notes'] });
    toast.success('Deleted');
  };

  const isFormOpen = adding || editingId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <p className="font-display text-xs tracking-wider text-foreground">IT Reference Notes</p>
        </div>
        {!isFormOpen && (
          <Button size="sm" variant="outline" onClick={() => { resetForm(); setAdding(true); }}
            className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        )}
      </div>

      <p className="font-body text-xs text-muted-foreground">
        Admin-only reference for external tools, credentials, and integrations.
      </p>

      {/* Add / Edit Form */}
      {isFormOpen && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Name (e.g. OpenClaw API)" value={formName}
              onChange={e => setFormName(e.target.value)} className="font-body text-sm" />

            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(cat => (
                <Button key={cat} size="sm" variant={formCategory === cat ? 'default' : 'outline'}
                  onClick={() => setFormCategory(cat)}
                  className="font-display text-[10px] tracking-wider capitalize min-h-[36px]">
                  {cat.replace('-', ' ')}
                </Button>
              ))}
            </div>

            <Textarea placeholder="Comments, codes, passwords, instructions..."
              value={formComments} onChange={e => setFormComments(e.target.value)}
              className="font-body text-sm min-h-[80px]" />

            {/* URLs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-display text-[10px] tracking-wider text-muted-foreground">LINKS</p>
                <Button size="sm" variant="ghost" onClick={addUrl}
                  className="font-display text-[10px] tracking-wider gap-1 min-h-[36px]">
                  <Plus className="w-3 h-3" /> URL
                </Button>
              </div>
              {formUrls.map((u, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input placeholder="Label" value={u.label}
                    onChange={e => updateUrl(i, 'label', e.target.value)}
                    className="font-body text-xs flex-1 min-w-0" />
                  <Input placeholder="https://..." value={u.url}
                    onChange={e => updateUrl(i, 'url', e.target.value)}
                    className="font-body text-xs flex-[2] min-w-0" />
                  <Button size="icon" variant="ghost" onClick={() => removeUrl(i)}
                    className="shrink-0 h-9 w-9">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={saveNote}
                className="font-display text-xs tracking-wider gap-1 min-h-[44px] flex-1">
                <Check className="w-3.5 h-3.5" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}
                className="font-display text-xs tracking-wider gap-1 min-h-[44px]">
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      {isLoading && <p className="font-body text-xs text-muted-foreground text-center py-8">Loading...</p>}
      {!isLoading && notes.length === 0 && !isFormOpen && (
        <div className="border border-dashed border-border rounded-lg py-10 flex flex-col items-center gap-2">
          <Monitor className="w-8 h-8 text-muted-foreground/50" />
          <p className="font-body text-sm text-muted-foreground">No IT notes yet</p>
          <p className="font-body text-xs text-muted-foreground/70">Tap "Add" to save external tools, credentials & links</p>
        </div>
      )}

      {notes.map(note => (
        <Card key={note.id} className="border-border">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm font-medium text-foreground truncate">{note.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="font-display text-[10px] tracking-wider capitalize">
                    {note.category.replace('-', ' ')}
                  </Badge>
                  <span className="font-body text-[10px] text-muted-foreground">
                    {format(new Date(note.updated_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => startEdit(note)}
                  className="h-10 w-10">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteNote(note.id)}
                  className="h-10 w-10 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {note.comments && (
              <p className="font-body text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {note.comments}
              </p>
            )}

            {Array.isArray(note.urls) && note.urls.length > 0 && (
              <div className="space-y-1">
                {note.urls.map((u: { label: string; url: string }, i: number) => (
                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline min-h-[44px] px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors">
                    {u.url.includes('drive.google') ? (
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="font-body text-xs truncate">
                      {u.label || u.url}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ITNotesSection;
