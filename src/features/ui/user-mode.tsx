import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type UserMode = 'friendly' | 'engineer';

interface UserModeContextValue {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
  toggleMode: () => void;
}

const USER_MODE_STORAGE_KEY = 'food-migration:user-mode';

const UserModeContext = createContext<UserModeContextValue | undefined>(undefined);

export function UserModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UserMode>(() => {
    if (typeof window === 'undefined') {
      return 'friendly';
    }
    const stored = window.localStorage.getItem(USER_MODE_STORAGE_KEY);
    return stored === 'engineer' ? 'engineer' : 'friendly';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-user-mode', mode);
  }, [mode]);

  const setMode = useCallback((next: UserMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(USER_MODE_STORAGE_KEY, next);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'engineer' ? 'friendly' : 'engineer');
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);
  return <UserModeContext.Provider value={value}>{children}</UserModeContext.Provider>;
}

export function useUserMode(): UserModeContextValue {
  const context = useContext(UserModeContext);
  if (!context) {
    throw new Error('useUserMode must be used within UserModeProvider');
  }
  return context;
}
