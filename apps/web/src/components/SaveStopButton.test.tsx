import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, useSession } from 'next-auth/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiToken } from '@/lib/api-token';
import { serveFavourites, stop } from '@/test/fake-favourites';
import { apiError } from '@/test/fake-fetch';
import { SaveStopButton } from './SaveStopButton';

vi.mock('next-auth/react', () => ({ useSession: vi.fn(), signIn: vi.fn() }));

const session = (status: string) =>
  vi.mocked(useSession).mockReturnValue({ status, data: null } as unknown as ReturnType<typeof useSession>);

const STOPS = { '83139': stop('83139', 'Aft Joo Chiat Pl') };

beforeEach(() => {
  clearApiToken();
  vi.mocked(signIn).mockReset();
});

describe('SaveStopButton', () => {
  it('signed out, offers sign-in and comes back to the same stop', async () => {
    session('unauthenticated');
    const fake = serveFavourites([], STOPS);
    render(<SaveStopButton code="83139" />);

    await userEvent.click(screen.getByRole('button', { name: /Sign in to save this stop/ }));

    expect(signIn).toHaveBeenCalledWith('google', { redirectTo: '/stops/83139' });
    expect(fake.calls).toHaveLength(0);
  });

  it('saves and unsaves the stop with the API token', async () => {
    session('authenticated');
    const fake = serveFavourites([], STOPS);
    render(<SaveStopButton code="83139" />);

    const button = await screen.findByRole('button', { name: /Save stop/, pressed: false });
    await userEvent.click(button);
    expect(await screen.findByRole('button', { name: /Saved/, pressed: true })).toBeEnabled();
    expect(fake.calls).toContainEqual({
      method: 'POST',
      path: '/v1/me/favourites',
      body: { busStopCode: '83139' },
      auth: 'Bearer api-token',
    });

    await userEvent.click(screen.getByRole('button', { name: /Saved/ }));
    expect(await screen.findByRole('button', { name: /Save stop/, pressed: false })).toBeEnabled();
    expect(fake.list).toHaveLength(0);
  });

  it('shows the already-saved state', async () => {
    session('authenticated');
    serveFavourites([{ id: 'f1', label: null, sortOrder: 0, stop: STOPS['83139'] }], STOPS);
    render(<SaveStopButton code="83139" />);

    expect(await screen.findByRole('button', { name: /Saved/, pressed: true })).toBeInTheDocument();
  });

  it('explains the 20-stop limit', async () => {
    session('authenticated');
    const fake = serveFavourites([], STOPS);
    fake.failNext(apiError(409, 'CONFLICT', 'You can save up to 20 stops'));
    render(<SaveStopButton code="83139" />);

    await userEvent.click(await screen.findByRole('button', { name: /Save stop/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You can save up to 20 stops');
    expect(screen.getByRole('button', { name: /Save stop/, pressed: false })).toBeEnabled();
  });
});
