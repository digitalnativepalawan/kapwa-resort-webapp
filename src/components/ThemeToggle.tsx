import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

const ThemeToggle = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycle = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const title =
    theme === 'system' ? 'Theme: System' : theme === 'light' ? 'Theme: Light' : 'Theme: Dark';

  return (
    <Button variant="ghost" size="icon" onClick={cycle} title={title} className="w-9 h-9 text-muted-foreground hover:text-foreground">
      <Icon className="w-4 h-4" />
    </Button>
  );
};

export default ThemeToggle;
