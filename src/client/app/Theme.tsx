import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'system' | 'dark';

const ThemeCtx = createContext<{ theme: Theme; cycle: () => void }>({
  theme: 'system',
  cycle: () => {},
});
const KEY = 'rosling-theme';
const themes: Theme[] = ['light', 'system', 'dark'];

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* private window */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* private window */ }
  }, [theme]);

  const cycle = () => setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length]);
  return <ThemeCtx.Provider value={{ theme, cycle }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  const { theme, cycle } = useContext(ThemeCtx);
  const next = themes[(themes.indexOf(theme) + 1) % themes.length];
  return (
    <div className="theme-control" role="group" aria-label="Color theme">
      <span>Light</span>
      <button type="button" className="theme-switch" data-theme={theme} aria-label={`Theme: ${theme}. Switch to ${next}`}
        title={`Theme: ${theme}. Click to switch to ${next}`} onClick={cycle}>
        <span />
      </button>
      <span>Dark</span>
    </div>
  );
}
