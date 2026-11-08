import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, useSession } from 'next-auth/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Favourite } from '@/lib/api';
import { clearApiToken } from '@/lib/api-token';
import { serveFavourites, stop } from '@/test/fake-favourites';
import { apiError, json } from '@/test/fake-fetch';
import { FavouritesPanel } from './FavouritesPanel';

vi.mock('next-auth/react', () => ({ useSession: vi.fn(), signIn: vi.fn() }));

const session = (status: string) =>
  vi.mocked(useSession).mockReturnValue({ status, data: null } as unknown as ReturnType<typeof useSession>);

const STOPS = {
  '83139': stop('83139', 'Aft Joo Chiat Pl'),
  '83141': stop('83141', 'Opp Joo Chiat Pl'),
  '83151': stop('83151', 'Bef Still Rd'),
  '83161': stop('83161', 'Joo Chiat Terminal'),
};

const fav = (n: number, code: keyof typeof STOPS, label: string | null = null): Favourite => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  label,
  sortOrder: n,
  stop: STOPS[code],
});

const NOW = Date.now();
const arrivalsFor = (path: string) => {
  const code = path.split('/')[3];
  const bus = (min: number) => ({
    estimatedArrival: new Date(NOW + min * 60_000 + 30_000).toISOString(),
    minutesAway: min,
    monitored: true,
  });
  return json({
    stopCode: code,
    fetchedAt: new Date(NOW).toISOString(),
    stale: false,
    source: 'lta',
    services: [
      { serviceNo: '33', operator: 'SBST', buses: [bus(9)] },
      { serviceNo: '15', operator: 'GAS', buses: [bus(3), bus(11)] },
      { serviceNo: '16', operator: 'SBST', buses: [] },
    ],
  });
};

beforeEach(() => {
  clearApiToken();
  vi.mocked(signIn).mockReset();
});

describe('FavouritesPanel', () => {
  it('signed out, invites sign-in without calling the API', async () => {
    session('unauthenticated');
    const fake = serveFavourites([], STOPS);
    render(<FavouritesPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith('google');
    expect(fake.calls).toHaveLength(0);
  });

  it('shows an empty state with a hint', async () => {
    session('authenticated');
    serveFavourites([], STOPS);
    render(<FavouritesPanel />);

    expect(await screen.findByText(/No saved stops yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows live times, soonest first, for the first three stops only', async () => {
    session('authenticated');
    const fake = serveFavourites(
      [fav(0, '83139', 'Home'), fav(1, '83141'), fav(2, '83151'), fav(3, '83161')],
      STOPS,
      arrivalsFor,
    );
    render(<FavouritesPanel />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/stops/83139');
    expect(items[0]).toHaveTextContent('Home');
    expect(items[0]).toHaveTextContent('83139 · Joo Chiat Rd');
    expect(await within(items[0]!).findByText('15')).toBeInTheDocument();
    expect(items[0]!.textContent).toMatch(/15 3 min.*33 9 min/);
    expect(items[0]).not.toHaveTextContent('16 ');
    expect(items[3]).toHaveTextContent('Joo Chiat Terminal');

    const arrivalCalls = fake.calls.filter((c) => c.path.includes('/arrivals'));
    expect([...new Set(arrivalCalls.map((c) => c.path.split('/')[3]))].sort()).toEqual([
      '83139',
      '83141',
      '83151',
    ]);
  });

  it('marks a stop that is no longer served instead of loading times', async () => {
    session('authenticated');
    const gone: Favourite = { ...fav(0, '83139'), stop: { ...STOPS['83139'], inService: false } };
    const fake = serveFavourites([gone], STOPS, arrivalsFor);
    render(<FavouritesPanel />);

    expect(await screen.findByText('No longer served')).toBeInTheDocument();
    expect(fake.calls.some((c) => c.path.includes('/arrivals'))).toBe(false);
  });

  it('offers a retry when the list fails to load', async () => {
    session('authenticated');
    let fail = true;
    serveFavourites([fav(0, '83139')], STOPS, arrivalsFor);
    const real = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (fail && String(url).endsWith('/v1/me/favourites'))
        return Promise.resolve(apiError(500, 'INTERNAL'));
      return real(url, init);
    });
    render(<FavouritesPanel />);

    expect(await screen.findByText(/couldn’t load/)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Aft Joo Chiat Pl')).toBeInTheDocument();
  });

  describe('editing', () => {
    beforeEach(() => session('authenticated'));

    async function openEditor(list: Favourite[]) {
      const fake = serveFavourites(list, STOPS, arrivalsFor);
      render(<FavouritesPanel />);
      await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
      return fake;
    }

    it('counts saved stops against the limit', async () => {
      await openEditor([fav(0, '83139'), fav(1, '83141')]);
      expect(screen.getByText(/2 of 20 saved/)).toBeInTheDocument();
    });

    it('renames a stop, and an empty name goes back to the stop name', async () => {
      const fake = await openEditor([fav(0, '83139')]);
      const input = screen.getByLabelText('Name for Aft Joo Chiat Pl (83139)');

      await userEvent.type(input, '  Home  ');
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(fake.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { label: 'Home' } });
      expect(await screen.findByRole('button', { name: 'Remove Home' })).toBeInTheDocument();

      await userEvent.clear(input);
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(fake.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { label: null } });
      expect(await screen.findByRole('button', { name: 'Remove Aft Joo Chiat Pl' })).toBeInTheDocument();
    });

    it('moves a stop and sends the whole new order', async () => {
      const fake = await openEditor([fav(0, '83139'), fav(1, '83141'), fav(2, '83151')]);

      expect(screen.getByRole('button', { name: 'Move Aft Joo Chiat Pl up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move Bef Still Rd down' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Move Bef Still Rd up' }));

      expect(fake.calls.at(-1)).toMatchObject({
        method: 'PUT',
        path: '/v1/me/favourites/order',
        body: { ids: [fav(0, '83139').id, fav(2, '83151').id, fav(1, '83141').id] },
      });
      const order = (await screen.findAllByLabelText(/^Name for/)).map((el) => el.id);
      expect(order).toEqual([fav(0, '83139'), fav(2, '83151'), fav(1, '83141')].map((f) => `label-${f.id}`));
    });

    it('removes a stop, and done goes back to live times', async () => {
      const fake = await openEditor([fav(0, '83139'), fav(1, '83141')]);

      await userEvent.click(screen.getByRole('button', { name: 'Remove Aft Joo Chiat Pl' }));
      expect(await screen.findByText(/1 of 20 saved/)).toBeInTheDocument();
      expect(fake.list.map((f) => f.stop.code)).toEqual(['83141']);

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.getByRole('link', { name: /Opp Joo Chiat Pl/ })).toBeInTheDocument();
    });

    it('says when a change did not save', async () => {
      const fake = await openEditor([fav(0, '83139')]);
      fake.failNext(apiError(503, 'UNAVAILABLE'));

      await userEvent.click(screen.getByRole('button', { name: 'Remove Aft Joo Chiat Pl' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save');
      expect(screen.getByRole('button', { name: 'Remove Aft Joo Chiat Pl' })).toBeEnabled();
    });
  });
});
