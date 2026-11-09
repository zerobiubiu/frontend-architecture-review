import { Theme } from '@astryxdesign/core';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { appTheme } from '@/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeModeContextValue {
  readonly mode: ThemeMode;
  readonly resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'binance-stocks.theme-mode';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
}

/**
 * Light / Dark / System 的唯一切换入口。
 * 颜色与圆角全部来自 Astryx 主题变量，业务组件不直接读 matchMedia 决定配色。
 */
export function ThemeModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存储不可用时仅本次会话生效
    }
  }, []);

  const resolvedMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, resolvedMode, setMode }),
    [mode, resolvedMode, setMode],
  );

  return (
    <ThemeModeContext value={value}>
      <Theme theme={appTheme} mode={mode}>
        {children}
      </Theme>
    </ThemeModeContext>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = use(ThemeModeContext);
  if (!context) throw new Error('useThemeMode 必须在 ThemeModeProvider 内使用');
  return context;
}
