import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bus, ServiceArrivals, StopArrivals } from '@/lib/api';
import { apiError, fakeFetch, json, never } from '@/test/fake-fetch';
import { StopArrivalsView } from './StopArrivalsView';

// Signed out: the save button only offers sign-in, so it makes no API calls of its own.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
  signIn: vi.fn(),
}));

const START = new Date('2026-11-04T08:00:00+08:00');
const STOP = {
  code: '83139',
  description: 'Aft Joo Chiat Pl',
  roadName: 'Joo Chiat Rd',
  latitude: 1.3,
  longitude: 103.9,
};

const bus = (minutes: number, overrides: Partial<Bus> = {}): Bus => ({
  estimatedArrival: new Date(START.getTime() + minutes * 60_000).toISOString(),
  minutesAway: minutes,
  monitored: true,
  load: 'SEATS_AVAILABLE',
  wheelchairAccessible: true,
  type: 'SINGLE_DECK',
  visitNumber: 1,
  originCode: '77009',
  destinationCode: '77009',
  ...overrides,
});

const service = (serviceNo: string, buses: Bus[]): ServiceArrivals => ({ serviceNo, operator: 'GAS', buses });

function arrivals(overrides: Partial<StopArrivals> = {}): StopArrivals {
  return {
    stopCode: '83139',
    fetchedAt: START.toISOString(),
    stale: false,
    source: 'lta',
    services: [service('15', [bus(5), bus(12), bus(20)])],
    ...overrides,
  };
}

/** Arrivals fetched this instant, like a real answer straight from LTA. */
const freshReply = () => json(arrivals({ fetchedAt: new Date().toISOString() }));

/** Answers the stop details, and uses `reply` for arrivals. */
function serve(reply: () => Response | Promise<Response>) {
  return fakeFetch((path) => (path.endsWith('/arrivals') ? reply() : json(STOP)));
}

const arrivalCalls = (fetch: ReturnType<typeof fakeFetch>) =>
  fetch.mock.calls.filter(([url]) => String(url).endsWith('/arrivals')).length;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  fireEvent(document, new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

async function show() {
  render(<StopArrivalsView code="83139" />);
  await advance(0);
}

describe('live arrivals', () => {
  it('shows the stop name and the next buses for each service', async () => {
    serve(() => json(arrivals()));
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Aft Joo Chiat Pl' })).toBeInTheDocument();
    expect(screen.getByText('83139 · Joo Chiat Rd')).toBeInTheDocument();
    const card = screen.getByRole('heading', { level: 2, name: '15' }).closest('li')!;
    expect(within(card).getByText('5 min')).toBeInTheDocument();
    expect(within(card).getByText('12 min')).toBeInTheDocument();
    expect(within(card).getByText('20 min')).toBeInTheDocument();
  });

  it('labels crowding, deck and wheelchair access in words, not colour alone', async () => {
    serve(() =>
      json(
        arrivals({
          services: [
            service('15', [
              bus(5, { load: 'SEATS_AVAILABLE', type: 'DOUBLE_DECK' }),
              bus(6, { load: 'STANDING_AVAILABLE', type: 'BENDY', wheelchairAccessible: false }),
              bus(7, { load: 'LIMITED_STANDING', wheelchairAccessible: false }),
            ]),
          ],
        }),
      ),
    );
    await show();

    expect(screen.getByText('Seats available')).toBeInTheDocument();
    expect(screen.getByText('Standing only')).toBeInTheDocument();
    expect(screen.getByText('Limited standing')).toBeInTheDocument();
    expect(screen.getByText('Double deck')).toBeInTheDocument();
    expect(screen.getByText('Bendy')).toBeInTheDocument();
    expect(screen.getAllByText('Wheelchair OK')).toHaveLength(1);
  });

  it('marks schedule-based times and copes with values LTA did not report', async () => {
    serve(() =>
      json(arrivals({ services: [service('15', [bus(5, { monitored: false, load: null, type: null })])] })),
    );
    await show();

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByText('Seats available')).not.toBeInTheDocument();
  });

  it('counts down between refreshes, reaching Arr', async () => {
    serve(() => json(arrivals({ services: [service('15', [bus(3)])] })));
    await show();
    expect(screen.getByText('3 min')).toBeInTheDocument();

    await advance(19_000);
    expect(screen.getByText('Updated 19 s ago')).toBeInTheDocument();

    await advance(11_000);
    expect(screen.getByText('2 min')).toBeInTheDocument();

    await advance(60_000);
    expect(screen.getByText('Arr')).toBeInTheDocument();
  });

  it('says when no buses are running, without showing an error', async () => {
    serve(() => json(arrivals({ services: [] })));
    await show();

    expect(screen.getByText('No buses in service right now.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when one service has no buses', async () => {
    serve(() => json(arrivals({ services: [service('12e', [])] })));
    await show();

    expect(screen.getByText('Not running right now')).toBeInTheDocument();
  });

  it('still shows arrivals when the stop details fail', async () => {
    fakeFetch((path) => (path.endsWith('/arrivals') ? json(arrivals()) : apiError(500, 'INTERNAL')));
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Bus stop 83139' })).toBeInTheDocument();
    expect(screen.getByText('5 min')).toBeInTheDocument();
  });
});

describe('auto-refresh', () => {
  it('refreshes just after the API cache expires, so each refresh brings new data', async () => {
    const fetch = serve(freshReply);
    await show();
    expect(arrivalCalls(fetch)).toBe(1);

    await advance(20_999);
    expect(arrivalCalls(fetch)).toBe(1);
    await advance(1);
    expect(arrivalCalls(fetch)).toBe(2);
    await advance(21_000);
    expect(arrivalCalls(fetch)).toBe(3);
  });

  it('refreshes sooner when the answer came from a cache another user filled', async () => {
    const fetch = serve(() =>
      json(arrivals({ fetchedAt: new Date(Date.now() - 6_000).toISOString(), source: 'cache' })),
    );
    await show();

    await advance(14_999);
    expect(arrivalCalls(fetch)).toBe(1);
    await advance(1);
    expect(arrivalCalls(fetch)).toBe(2);
  });

  it('pauses while the page is hidden and refreshes at once on return', async () => {
    const fetch = serve(freshReply);
    await show();

    setHidden(true);
    await advance(120_000);
    expect(arrivalCalls(fetch)).toBe(1);

    setHidden(false);
    await advance(0);
    expect(arrivalCalls(fetch)).toBe(2);
    await advance(21_000);
    expect(arrivalCalls(fetch)).toBe(3);
  });

  it('does not load at all while opened in a hidden tab, until shown', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const fetch = serve(() => json(arrivals()));
    await show();
    expect(arrivalCalls(fetch)).toBe(0);

    setHidden(false);
    await advance(0);

    expect(screen.getByText('5 min')).toBeInTheDocument();
  });

  it('stops refreshing when the page is left', async () => {
    const fetch = serve(() => json(arrivals()));
    const { unmount } = render(<StopArrivalsView code="83139" />);
    await advance(0);
    const before = arrivalCalls(fetch);

    unmount();
    await advance(60_000);

    expect(arrivalCalls(fetch)).toBe(before);
  });

  it('has a Refresh button that fetches now and tells screen readers', async () => {
    const fetch = serve(() => json(arrivals()));
    await show();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await advance(0);

    expect(arrivalCalls(fetch)).toBe(2);
    expect(screen.getByRole('status')).toHaveTextContent('Arrival times updated');
  });
});

describe('when something goes wrong', () => {
  it('keeps the last times and warns when a refresh fails, then recovers', async () => {
    let healthy = true;
    serve(() => (healthy ? json(arrivals()) : apiError(500, 'INTERNAL')));
    await show();

    healthy = false;
    await advance(21_000);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t refresh. Showing times from 08:00.');
    expect(screen.getByText('4 min')).toBeInTheDocument();

    healthy = true;
    await advance(20_000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('counts a refresh that hangs for 15 s as failed', async () => {
    let healthy = true;
    serve(() => (healthy ? json(arrivals()) : never()));
    await show();

    healthy = false;
    await advance(21_000 + 14_999);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advance(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t refresh.');
  });

  it('drops times over 10 minutes old instead of showing them', async () => {
    let healthy = true;
    serve(() => (healthy ? json(arrivals()) : apiError(500, 'INTERNAL')));
    await show();

    healthy = false;
    await advance(10 * 60_000 + 20_000);

    expect(screen.getByRole('alert')).toHaveTextContent('Live arrivals are temporarily unavailable.');
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('flags stale data from the API with the time it is from', async () => {
    serve(() => json(arrivals({ stale: true, source: 'stale' })));
    await show();

    expect(screen.getByRole('alert')).toHaveTextContent('Live data unavailable. Showing times from 08:00.');
    expect(screen.getByText('5 min')).toBeInTheDocument();
  });

  it('explains when LTA is down, with a working Try again', async () => {
    let healthy = false;
    const fetch = serve(() => (healthy ? json(arrivals()) : apiError(503, 'LTA_UNAVAILABLE')));
    await show();
    expect(screen.getByRole('alert')).toHaveTextContent('Live arrivals are temporarily unavailable.');
    expect(arrivalCalls(fetch)).toBe(1);

    healthy = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await advance(0);

    expect(screen.getByText('5 min')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers by itself once LTA is back', async () => {
    let healthy = false;
    serve(() => (healthy ? json(arrivals()) : apiError(503, 'LTA_UNAVAILABLE')));
    await show();

    healthy = true;
    await advance(20_000);

    expect(screen.getByText('4 min')).toBeInTheDocument();
  });

  it('shows the waking message after 3 s, and the arrivals once the server answers', async () => {
    let awake = false;
    serve(() => (awake ? json(arrivals()) : Promise.reject(new TypeError('fetch failed'))));
    await show();
    expect(screen.getByRole('status')).toHaveTextContent('Loading arrivals');

    await advance(3_000);
    expect(screen.getByRole('status')).toHaveTextContent('Waking up the server');

    awake = true;
    await advance(8_000);
    expect(screen.getByText('4 min')).toBeInTheDocument();
  });

  it('keeps waiting for a slow wake-up past the 20 s refresh', async () => {
    const fetch = serve(never);
    await show();

    await advance(45_000);

    expect(arrivalCalls(fetch)).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Waking up the server');
  });

  it('stops asking once it knows the stop does not exist', async () => {
    const fetch = serve(() => apiError(404, 'NOT_FOUND'));
    await show();

    await advance(120_000);

    expect(arrivalCalls(fetch)).toBe(1);
  });

  it.each([
    [404, 'NOT_FOUND'],
    [400, 'VALIDATION_FAILED'],
  ])('shows stop not found for a %s', async (status, code) => {
    serve(() => apiError(status, code));
    await show();

    expect(screen.getByRole('heading', { level: 1, name: 'Stop not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search for a stop/ })).toHaveAttribute('href', '/');
  });
});
