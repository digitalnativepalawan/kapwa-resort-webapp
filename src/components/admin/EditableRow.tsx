import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

interface EditableRowProps {
  id: string;
  name: string;
  active: boolean;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
}

const EditableRow = ({ id, name, active, onRename, onDelete, onToggle }: EditableRowProps) => {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [confirming, setConfirming] = useState(false);

  const handleSave = async () => {
    if (!editName.trim()) return;
    await onRename(id, editName.trim());
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    await onDelete(id);
    setConfirming(false);
  };

  return (
    <div className="flex items-center justify-between py-2.5 px-2 border-b border-border gap-2">
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="bg-secondary border-border text-foreground font-body h-8 text-sm"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-gold" onClick={handleSave}><Check className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-cream-dim" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
        </div>
      ) : (
        <>
          <span className="font-body text-sm text-foreground flex-1">{name}</span>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-cream-dim hover:text-foreground" onClick={() => { setEditName(name); setEditing(true); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${confirming ? 'text-destructive animate-pulse' : 'text-cream-dim hover:text-destructive'}`}
              onClick={handleDelete}
              title={confirming ? 'Click again to confirm' : 'Delete'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Switch checked={active} onCheckedChange={v => onToggle(id, v)} />
          </div>
        </>
      )}
    </div>
  );
};

export default EditableRow;
