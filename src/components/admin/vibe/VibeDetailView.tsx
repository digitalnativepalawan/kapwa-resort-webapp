import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, ChevronDown, Edit2, Plus, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  record: any;
  onBack: () => void;
  onEdit: () => void;
}

const VibeDetailView = ({ record, onBack, onEdit }: Props) => {
  const qc = useQueryClient();
  const [interventionNote, setInterventionNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: updates = [] } = useQuery({
    queryKey: ['vibe-updates', record.id],
    queryFn: async () => {
      const { data } = await (supabase.from('vibe_updates' as any) as any)
        .select('*').eq('vibe_record_id', record.id).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: interventions = [] } = useQuery({
    queryKey: ['interventions', record.id],
    queryFn: async () => {
      const { data } = await (supabase.from('interventions' as any) as any)
        .select('*').eq('vibe_record_id', record.id).order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  const addIntervention = async () => {
    if (!interventionNote.trim()) return;
    await (supabase.from('interventions' as any) as any).insert({
      vibe_record_id: record.id,
      note: interventionNote.trim(),
    });
    setInterventionNote('');
    qc.invalidateQueries({ queryKey: ['interventions', record.id] });
    toast.success('Intervention logged');
  };

  const isHighRisk = (record.review_risk_level || []).includes('High');

  const PillDisplay = ({ items }: { items: string[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item: string) => (
        <Badge key={item} variant="secondary" className="font-body text-xs">{item}</Badge>
      ))}
    </div>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <p className="font-body text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h3 className="font-display text-lg tracking-wider text-foreground">{record.guest_name}</h3>
          <p className="font-body text-xs text-muted-foreground">{record.unit_name} · {record.nationality || 'N/A'}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit} className="min-h-[40px] font-display text-xs tracking-wider gap-1">
          <Edit2 className="w-4 h-4" /> Update
        </Button>
      </div>

      {isHighRisk && (
        <div className="flex items-center gap-2 p-3 border-2 border-destructive rounded-lg bg-destructive/10">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <span className="font-display text-sm text-destructive tracking-wider">High Review Risk</span>
        </div>
      )}

      <div className={`border rounded-lg p-4 space-y-3 ${isHighRisk ? 'border-destructive' : 'border-border'}`}>
        <Field label="Age Range"><PillDisplay items={record.age_range || []} /></Field>
        <Field label="Travel Composition"><PillDisplay items={record.travel_composition || []} /></Field>
        <Field label="Arrival Energy"><PillDisplay items={record.arrival_energy || []} /></Field>
        <Field label="Communication Style"><PillDisplay items={record.communication_style || []} /></Field>
        <Field label="Personality Type"><PillDisplay items={record.personality_type || []} /></Field>
        <Field label="Mood State"><PillDisplay items={record.mood_state || []} /></Field>
        <Field label="Special Context"><PillDisplay items={record.special_context || []} /></Field>
        <Field label="Early Signals"><PillDisplay items={record.early_signals || []} /></Field>
        <Field label="Gut Feeling"><PillDisplay items={record.gut_feeling || []} /></Field>
        <Field label="Review Risk Level"><PillDisplay items={record.review_risk_level || []} /></Field>
        {record.staff_notes && <Field label="Staff Notes"><p className="font-body text-sm text-foreground">{record.staff_notes}</p></Field>}
        {record.food_allergies && <Field label="Food Allergies"><p className="font-body text-sm text-foreground">{record.food_allergies}</p></Field>}
        {record.medical_conditions && <Field label="Medical Conditions"><p className="font-body text-sm text-foreground">{record.medical_conditions}</p></Field>}
        {record.personal_preferences && <Field label="Personal Preferences"><p className="font-body text-sm text-foreground">{record.personal_preferences}</p></Field>}
      </div>

      {/* Update History */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-display text-xs tracking-wider min-h-[44px]">
            Vibe Update History ({updates.length})
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          {updates.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground text-center py-2">No updates yet</p>
          ) : updates.map((u: any) => (
            <div key={u.id} className="border border-border rounded-lg p-3">
              <p className="font-body text-xs text-muted-foreground">
                {u.updated_by} · {format(new Date(u.created_at), 'MMM d · h:mm a')}
              </p>
              {u.notes && <p className="font-body text-sm text-foreground mt-1">{u.notes}</p>}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* Interventions */}
      <div className="space-y-2">
        <h4 className="font-display text-xs tracking-wider text-muted-foreground uppercase">Interventions Log</h4>
        <div className="border border-border rounded-lg p-3 space-y-2">
          <Textarea value={interventionNote} onChange={e => setInterventionNote(e.target.value)}
            placeholder="Log an action taken..." className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />
          <Button size="sm" onClick={addIntervention} disabled={!interventionNote.trim()}
            className="w-full font-display text-xs tracking-wider min-h-[44px]">
            <Plus className="w-3.5 h-3.5 mr-1" /> Log Intervention
          </Button>
        </div>
        {interventions.map((iv: any) => (
          <div key={iv.id} className="border border-border rounded-lg p-3">
            <p className="font-body text-sm text-foreground">{iv.note}</p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              {iv.created_by} · {format(new Date(iv.created_at), 'MMM d · h:mm a')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VibeDetailView;
