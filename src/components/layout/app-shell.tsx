import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserMode } from '@/features/ui/user-mode';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'food-migration:theme';

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const { mode, setMode } = useUserMode();

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
      document.documentElement.setAttribute('data-theme', stored);
      document.documentElement.style.colorScheme = stored;
      return;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme: ThemeMode = prefersDark ? 'dark' : 'light';
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
    document.documentElement.style.colorScheme = initialTheme;
  }, []);

  const changeTheme = (next: ThemeMode) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide sm:text-base">
            <PawPrint className="h-5 w-5 text-primary" />
            <span>Food Migration</span>
          </Link>
          <nav className="flex w-full flex-wrap items-center gap-2 text-sm sm:w-auto">
            <Link
              className={cn(
                'min-w-[88px] flex-1 rounded-md border border-transparent px-3 py-2 text-center text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground sm:min-w-0 sm:flex-none',
                location.pathname === '/' && 'border-border bg-muted/50 font-medium text-foreground'
              )}
              to="/"
            >
              Dashboard
            </Link>
            <Link
              className={cn(
                'min-w-[88px] flex-1 rounded-md border border-transparent px-3 py-2 text-center text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground sm:min-w-0 sm:flex-none',
                location.pathname.includes('/plans/new') && 'border-border bg-muted/50 font-medium text-foreground'
              )}
              to="/plans/new"
            >
              New Plan
            </Link>
            <Link
              className={cn(
                'min-w-[88px] flex-1 rounded-md border border-transparent px-3 py-2 text-center text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground sm:min-w-0 sm:flex-none',
                location.pathname === '/about' && 'border-border bg-muted/50 font-medium text-foreground'
              )}
              to="/about"
            >
              About
            </Link>
            <div className="min-w-[140px] flex-1 sm:min-w-0 sm:flex-none">
              <Select value={mode} onValueChange={(value: 'friendly' | 'engineer') => setMode(value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="表示モード" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">表示: やさしい</SelectItem>
                  <SelectItem value="engineer">表示: 詳細</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[132px] flex-1 sm:min-w-0 sm:flex-none">
              <Select value={theme} onValueChange={(value: ThemeMode) => changeTheme(value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="テーマ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">テーマ: ダーク</SelectItem>
                  <SelectItem value="light">テーマ: ライト</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 pb-10">{children}</main>
    </div>
  );
}
