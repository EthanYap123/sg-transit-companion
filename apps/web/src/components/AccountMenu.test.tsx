import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, useSession } from 'next-auth/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';

vi.mock('next-auth/react', () => ({ useSession: vi.fn(), signIn: vi.fn() }));

const session = (status: string, user?: Record<string, unknown>) =>
  vi.mocked(useSession).mockReturnValue({
    status,
    data: user ? { user } : null,
  } as unknown as ReturnType<typeof useSession>);

describe('AccountMenu', () => {
  it('shows no button while the session loads, so it does not flash Sign in', () => {
    session('loading');

    render(<AccountMenu />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers GitHub sign-in when signed out', async () => {
    session('unauthenticated');
    render(<AccountMenu />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(signIn).toHaveBeenCalledWith('github');
  });

  it('links to settings with the picture when signed in', () => {
    session('authenticated', { name: 'Ethan', image: 'https://example.com/a.png' });

    render(<AccountMenu />);

    const link = screen.getByRole('link', { name: 'Account settings' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.png');
  });

  it('falls back to an initial without a picture', () => {
    session('authenticated', { name: 'ethan', image: null });

    render(<AccountMenu />);

    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveTextContent('E');
  });
});
