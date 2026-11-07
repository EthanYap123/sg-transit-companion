import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, signOut, useSession } from 'next-auth/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiToken, getApiToken } from '@/lib/api-token';
import { apiError, fakeFetch, json } from '@/test/fake-fetch';
import { SettingsView } from './SettingsView';

vi.mock('next-auth/react', () => ({ useSession: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));

const ME = {
  id: 'user-1',
  name: 'Ethan',
  imageUrl: 'https://example.com/a.png',
  createdAt: '2026-11-07T00:00:00.000Z',
};
const TOKEN = { token: 'api-token', expiresAt: Date.now() + 15 * 60_000 };

const session = (status: string) =>
  vi.mocked(useSession).mockReturnValue({
    status,
    data: status === 'authenticated' ? { user: { name: 'Ethan' } } : null,
  } as unknown as ReturnType<typeof useSession>);

/** Answers the token route and the API. `api` decides how /v1/me replies. */
function serve(api: (method: string) => Response = () => json(ME)) {
  const calls: Array<{ path: string; method: string; auth: string | undefined }> = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace('https://api.test', '');
    const method = init?.method ?? 'GET';
    calls.push({ path, method, auth: (init?.headers as Record<string, string>)?.Authorization });
    return Promise.resolve(path === '/api/token' ? json(TOKEN) : api(method));
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

beforeEach(() => {
  clearApiToken();
  vi.mocked(signOut).mockReset();
  vi.mocked(signIn).mockReset();
});

describe('SettingsView signed out', () => {
  it('offers sign-in and says an account is optional', async () => {
    session('unauthenticated');
    const fetch = fakeFetch(() => json({}));
    render(<SettingsView />);

    expect(screen.getByText(/You don’t need one to search/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(signIn).toHaveBeenCalledWith('google');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('SettingsView signed in', () => {
  beforeEach(() => session('authenticated'));

  it('loads the account with the API token and shows it', async () => {
    const calls = serve();
    render(<SettingsView />);

    expect(await screen.findByText('Ethan')).toBeInTheDocument();
    expect(screen.getByText('Member since 7 November 2026')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/v1/me')?.auth).toBe('Bearer api-token');
  });

  it('shows an error with a working retry when the API fails', async () => {
    let healthy = false;
    serve(() => (healthy ? json(ME) : apiError(503, 'DEPENDENCY_UNAVAILABLE')));
    render(<SettingsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account isn’t available right now.');
    expect(screen.queryByRole('button', { name: 'Delete my account' })).not.toBeInTheDocument();

    healthy = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Ethan')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('signs out and forgets the token', async () => {
    serve();
    render(<SettingsView />);
    await screen.findByText('Ethan');

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/' });
    const callsAfter = serve();
    await getApiToken();
    expect(callsAfter.map((c) => c.path)).toEqual(['/api/token']);
  });

  it('asks for confirmation before deleting, and can be cancelled', async () => {
    const calls = serve();
    render(<SettingsView />);
    await screen.findByText('Ethan');

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('deletes through the API, then signs out', async () => {
    const calls = serve((method) => (method === 'DELETE' ? new Response(null, { status: 204 }) : json(ME)));
    render(<SettingsView />);
    await screen.findByText('Ethan');

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectTo: '/' }));
    expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({
      path: '/v1/me',
      auth: 'Bearer api-token',
    });
  });

  it('stays signed in and says nothing was removed when deleting fails', async () => {
    serve((method) => (method === 'DELETE' ? apiError(503, 'DEPENDENCY_UNAVAILABLE') : json(ME)));
    render(<SettingsView />);
    await screen.findByText('Ethan');

    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete my account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was removed.');
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toBeEnabled();
  });
});
