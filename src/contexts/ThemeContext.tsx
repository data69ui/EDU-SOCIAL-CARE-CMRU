import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'edu_cmru_theme';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.sessionStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    try {
      window.sessionStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'light',
      isDark: false,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

interface ThemeToggleButtonProps {
  variant?: 'icon' | 'pill' | 'sidebar';
  className?: string;
}

export function ThemeToggleButton({
  variant = 'pill',
  className = '',
}: ThemeToggleButtonProps) {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();

  if (variant === 'sidebar') {
    return (
      <div
        role="group"
        aria-label="เลือกโหมดการแสดงผล"
        className={`grid grid-cols-2 gap-1 rounded-xl border border-white/15 bg-black/20 p-1 ${className}`}
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          aria-pressed={theme === 'light'}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            theme === 'light'
              ? 'bg-[#C6922C] text-[#23181A] font-semibold shadow-xs'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>โหมดสว่าง</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          aria-pressed={theme === 'dark'}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            theme === 'dark'
              ? 'bg-[#7A1629] text-[#F9E8B2] border border-[#E8C97A]/70 font-semibold shadow-xs'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>โหมดมืด</span>
        </button>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'สลับเป็นโหมดสว่าง (Light Mode)' : 'สลับเป็นโหมดมืด (Dark Mode)'}
        title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#DFD1BA] bg-[#FAF6EE] text-[#7A1629] hover:bg-[#F3ECDF] dark:border-[#3A3E4A] dark:bg-[#282B33] dark:text-[#E8C97A] dark:hover:bg-[#323640] transition-colors ${className}`}
      >
        {isDark ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'สลับเป็นโหมดสว่าง (Light Mode)' : 'สลับเป็นโหมดมืด (Dark Mode)'}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-[#DFD1BA] bg-white px-3 py-1.5 text-xs font-medium text-[#23181A] hover:bg-[#FAF6EE] dark:border-[#3A3E4A] dark:bg-[#282B33] dark:text-[#F2EFEA] dark:hover:bg-[#323640] transition-colors whitespace-nowrap shrink-0 ${className}`}
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-[#E8C97A] shrink-0" aria-hidden="true" />
          <span>โหมดสว่าง</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-[#7A1629] shrink-0" aria-hidden="true" />
          <span>โหมดมืด</span>
        </>
      )}
    </button>
  );
}
