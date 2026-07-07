import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import PillToggle from './PillToggle';
import { useAppOptions, getOptionsByCategory } from '@/hooks/useAppOptions';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h4 className="font-display text-xs tracking-wider text-muted-foreground uppercase">{title}</h4>
    {children}
  </div>
);

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="font-body text-sm text-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </label>
    {children}
  </div>
);

interface Props {
  unitName: string;
  onClose: () => void;
  existingRecord?: any;
}

const VibeCheckInForm = ({ unitName, onClose, existingRecord }: Props) => {
  const qc = useQueryClient();
  const { data: allOptions = [] } = useAppOptions();
  const opts = (cat: string) => getOptionsByCategory(allOptions, cat);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    checkin_date: existingRecord?.checkin_date || new Date().toISOString().split('T')[0],
    guest_name: existingRecord?.guest_name || '',
    nationality: existingRecord?.nationality || '',
    age_range: existingRecord?.age_range || [],
    travel_composition: existingRecord?.travel_composition || [],
    arrival_energy: existingRecord?.arrival_energy || [],
    communication_style: existingRecord?.communication_style || [],
    personality_type: existingRecord?.personality_type || [],
    mood_state: existingRecord?.mood_state || [],
    special_context: existingRecord?.special_context || [],
    early_signals: existingRecord?.early_signals || [],
    gut_feeling: existingRecord?.gut_feeling || [],
    review_risk_level: existingRecord?.review_risk_level || [],
    staff_notes: existingRecord?.staff_notes || '',
    food_allergies: existingRecord?.food_allergies || '',
    medical_conditions: existingRecord?.medical_conditions || '',
    personal_preferences: existingRecord?.personal_preferences || '',
  });

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const save = async () => {
    if (!form.guest_name.trim()) { toast.error('Guest name is required'); return; }
    if (form.age_range.length === 0) { toast.error('Age range is required'); return; }
    if (form.travel_composition.length === 0) { toast.error('Travel composition is required'); return; }
    if (form.personality_type.length === 0) { toast.error('Personality type is required'); return; }
    if (form.gut_feeling.length === 0) { toast.error('Gut feeling is required'); return; }
    if (form.review_risk_level.length === 0) { toast.error('Review risk level is required'); return; }

    setSaving(true);
    const payload = { ...form, unit_name: unitName };

    if (existingRecord) {
      // Save vibe update history
      await (supabase.from('vibe_updates' as any) as any).insert({
        vibe_record_id: existingRecord.id,
        updated_fields: payload,
        notes: 'Updated vibe profile',
      });
      await (supabase.from('guest_vibe_records' as any) as any)
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existingRecord.id);
      toast.success('Vibe record updated');
    } else {
      await (supabase.from('guest_vibe_records' as any) as any).insert(payload);
      toast.success('Vibe check-in saved');
    }

    qc.invalidateQueries({ queryKey: ['vibe-records'] });
    qc.invalidateQueries({ queryKey: ['vibe-updates'] });
    setSaving(false);
    onClose();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h3 className="font-display text-lg tracking-wider text-foreground">
          {existingRecord ? 'Update' : 'New'} Vibe Check-In
        </h3>
      </div>

      <Section title="Guest Basics">
        <Field label="Check-in Date" required>
          <Input type="date" value={form.checkin_date} onChange={e => set('checkin_date', e.target.value)}
            className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
        <Field label="Room / Cottage">
          <Input value={unitName} disabled className="bg-muted border-border text-muted-foreground font-body text-sm" />
        </Field>
        <Field label="Guest Name / Initials" required>
          <Input value={form.guest_name} onChange={e => set('guest_name', e.target.value)}
            placeholder="e.g. J.S. or John Smith" className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
        <Field label="Nationality">
          <Input value={form.nationality} onChange={e => set('nationality', e.target.value)}
            placeholder="e.g. German" className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
        <Field label="Age Range" required>
          <PillToggle options={opts('age_range')} selected={form.age_range} onChange={v => set('age_range', v)} />
        </Field>
        <Field label="Travel Composition" required>
          <PillToggle options={opts('travel_composition')} selected={form.travel_composition} onChange={v => set('travel_composition', v)} />
        </Field>
      </Section>

      <Section title="Vibe Assessment">
        <Field label="Arrival Energy">
          <PillToggle options={opts('arrival_energy')} selected={form.arrival_energy} onChange={v => set('arrival_energy', v)} />
        </Field>
        <Field label="Communication Style">
          <PillToggle options={opts('communication_style')} selected={form.communication_style} onChange={v => set('communication_style', v)} />
        </Field>
        <Field label="Personality Type" required>
          <PillToggle options={opts('personality_type')} selected={form.personality_type} onChange={v => set('personality_type', v)} />
        </Field>
        <Field label="Mood State">
          <PillToggle options={opts('mood_state')} selected={form.mood_state} onChange={v => set('mood_state', v)} />
        </Field>
      </Section>

      <Section title="Context & Signals">
        <Field label="Special Context">
          <PillToggle options={opts('special_context')} selected={form.special_context} onChange={v => set('special_context', v)} />
        </Field>
        <Field label="Early Signals">
          <PillToggle options={opts('early_signals')} selected={form.early_signals} onChange={v => set('early_signals', v)} />
        </Field>
      </Section>

      <Section title="Staff Assessment">
        <Field label="Gut Feeling" required>
          <PillToggle options={opts('gut_feeling')} selected={form.gut_feeling} onChange={v => set('gut_feeling', v)} />
        </Field>
        <Field label="Review Risk Level" required>
          <PillToggle options={opts('review_risk_level')} selected={form.review_risk_level} onChange={v => set('review_risk_level', v)} />
        </Field>
        <Field label="Staff Notes">
          <Textarea value={form.staff_notes} onChange={e => set('staff_notes', e.target.value)}
            placeholder="Any observations..." className="bg-secondary border-border text-foreground font-body text-sm min-h-[60px]" />
        </Field>
      </Section>

      <Section title="Guest Needs (Optional)">
        <Field label="Food Allergies">
          <Input value={form.food_allergies} onChange={e => set('food_allergies', e.target.value)}
            placeholder="e.g. shellfish, gluten" className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
        <Field label="Medical Conditions">
          <Input value={form.medical_conditions} onChange={e => set('medical_conditions', e.target.value)}
            placeholder="e.g. asthma" className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
        <Field label="Personal Preferences">
          <Input value={form.personal_preferences} onChange={e => set('personal_preferences', e.target.value)}
            placeholder="e.g. extra pillows" className="bg-secondary border-border text-foreground font-body text-sm" />
        </Field>
      </Section>

      <Button onClick={save} disabled={saving} className="w-full font-display text-sm tracking-wider min-h-[44px]">
        <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : existingRecord ? 'Update Vibe Record' : 'Save Vibe Check-In'}
      </Button>
    </div>
  );
};

export default VibeCheckInForm;
