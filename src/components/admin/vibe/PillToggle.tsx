import { cn } from '@/lib/utils';

interface PillToggleProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  required?: boolean;
}

const PillToggle = ({ options, selected, onChange }: PillToggleProps) => {
  const toggle = (label: string) => {
    if (selected.includes(label)) {
      onChange(selected.filter(s => s !== label));
    } else {
      onChange([...selected, label]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            'px-3 py-2 rounded-full font-body text-xs border transition-colors min-h-[40px]',
            selected.includes(opt)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-secondary text-foreground border-border hover:bg-accent'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
};

export default PillToggle;
