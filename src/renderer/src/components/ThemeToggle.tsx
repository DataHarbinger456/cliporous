import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
