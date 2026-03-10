import { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, useAppStore, applyThemeClass } from '@/stores/app.store';
import type { Theme } from '@/stores/app.store';

const CYCLE: Theme[] = ['system', 'light', 'dark'];

export function ThemeToggle() {
  const theme = useTheme();
  const setTheme = useAppStore((s) => s.setTheme);

  const handleClick = () => {
    const idx = CYCLE.indexOf(theme);
    const next = CYCLE[(idx + 1) % CYCLE.length] as Theme;
    setTheme(next);
  };

  // Listen for OS preference changes when in system mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (useAppStore.getState().theme === 'system') {
        applyThemeClass('system');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const icon =
    theme === 'system' ? (
      <Monitor className="h-4 w-4" />
    ) : theme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleClick}
      aria-label="Toggle theme"
    >
      {icon}
    </Button>
  );
}
