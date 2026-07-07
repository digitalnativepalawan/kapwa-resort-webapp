import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TimePickerProps {
  value: string; // "HH:MM" 24h format
  onChange: (value: string) => void;
  label: string;
}

const hours = Array.from({ length: 12 }, (_, i) => i + 1);

function to12h(time24: string): { hour: string; period: string } {
  const [hStr] = time24.split(':');
  let h = parseInt(hStr) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: String(h), period };
}

function to24h(hour: string, period: string): string {
  let h = parseInt(hour);
  if (period === 'AM' && h === 12) h = 0;
  else if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:00`;
}

const TimePicker = ({ value, onChange, label }: TimePickerProps) => {
  const { hour, period } = to12h(value || '07:00');

  return (
    <div>
      <label className="font-body text-xs text-cream-dim">{label}</label>
      <div className="flex gap-2 mt-1">
        <Select value={hour} onValueChange={v => onChange(to24h(v, period))}>
          <SelectTrigger className="bg-secondary border-border text-foreground font-body flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {hours.map(h => (
              <SelectItem key={h} value={String(h)} className="font-body text-foreground">{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={v => onChange(to24h(hour, v))}>
          <SelectTrigger className="bg-secondary border-border text-foreground font-body w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="AM" className="font-body text-foreground">AM</SelectItem>
            <SelectItem value="PM" className="font-body text-foreground">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default TimePicker;
