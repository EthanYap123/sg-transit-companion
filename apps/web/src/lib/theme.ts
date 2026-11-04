import { useSyncExternalStore } from 'react';
import { THEME_KEY } from './theme-init';

export type Theme = 'light' | 'dark' | 'system';

const listeners = new Set<() => void>();
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
  };
}

function currentTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || theme === 'system' ? theme : 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage. The theme still applies until the page closes.
  }
  listeners.forEach((listener) => listener());
}

/** The saved choice. On the server it is always light, the default. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}

/** Whether the page is showing dark colours right now, after resolving "Match device". */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      const theme = currentTheme();
      return theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches);
    },
    () => false,
  );
}
