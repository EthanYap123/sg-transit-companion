import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_INIT_SCRIPT, THEME_KEY } from '@/lib/theme-init';
import { ThemeSetting, ThemeToggle } from './ThemeControls';

const page = document.documentElement;

function deviceInDarkMode(dark: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: dark,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  localStorage.clear();
  page.dataset.theme = 'light';
  deviceInDarkMode(false);
});

describe('theme controls', () => {
  it('the toggle switches between light and dark and saves the choice', async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(page.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(page.dataset.theme).toBe('light');
  });

  it('the setting offers Light, Dark and Match device, and stays in step with the toggle', async () => {
    render(
      <>
        <ThemeToggle />
        <ThemeSetting />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Match device' }));
    expect(page.dataset.theme).toBe('system');
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('with Match device on a dark device, the toggle offers light', () => {
    page.dataset.theme = 'system';
    deviceInDarkMode(true);

    render(<ThemeToggle />);

    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});

describe('the script that runs before the first paint', () => {
  const runScript = () => new Function(THEME_INIT_SCRIPT)() as void;

  it('defaults to light even on a device in dark mode', () => {
    deviceInDarkMode(true);
    page.dataset.theme = '';

    runScript();

    expect(page.dataset.theme).toBe('light');
  });

  it.each(['dark', 'system'])('restores a saved %s choice', (saved) => {
    localStorage.setItem(THEME_KEY, saved);

    runScript();

    expect(page.dataset.theme).toBe(saved);
  });

  it('ignores anything else in storage', () => {
    localStorage.setItem(THEME_KEY, 'neon');

    runScript();

    expect(page.dataset.theme).toBe('light');
  });
});
