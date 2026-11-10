import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, fakeFetch, json, never } from '@/test/fake-fetch';
import { fakeLocation, noLocation } from '@/test/fake-location';
import { NearbyStops } from './NearbyStops';

const JOO_CHIAT = { latitude: 1.315512345, longitude: 103.905912345 };
const NEARBY = [
  {
    code: '83299',
    description: 'Aft Lor G Telok Kurau',
    roadName: 'Still Rd',
    latitude: 1.31574,
    longitude: 103.90586,
    distanceMeters: 27,
  },
  {
    code: '83291',
    description: 'Aft Joo Chiat Pl',
    roadName: 'Still Rd',
    latitude: 1.3162,
    longitude: 103.9061,
    distanceMeters: 85,
  },
];

const useLocation = () => screen.getByRole('button', { name: 'Use my location' });

afterEach(noLocation);

describe('NearbyStops', () => {
  it('does not ask for location until "Use my location" is tapped', () => {
    const ask = fakeLocation(JOO_CHIAT);
    const fetch = fakeFetch(() => json({ results: NEARBY }));

    render(<NearbyStops />);

    expect(screen.getByRole('heading', { name: 'Stops near you' })).toBeInTheDocument();
    expect(screen.getByText(/never saved/)).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists stops nearest first with their distance, linking to arrivals', async () => {
    fakeLocation(JOO_CHIAT);
    const fetch = fakeFetch(() => json({ results: NEARBY }));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      '83299Aft Lor G Telok KurauStill Rd27 m away',
      '83291Aft Joo Chiat PlStill Rd85 m away',
    ]);
    expect(links[0]).toHaveAttribute('href', '/stops/83299');
    expect(screen.getByRole('status')).toHaveTextContent('2 stops within 500 m');
    // Rounded to about a metre: enough for a stop list, no more precise than needed.
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/stops/nearby?lat=1.31551&lng=103.90591');
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('shows progress and blocks a second tap while the browser finds the position', async () => {
    fakeLocation('never');
    fakeFetch(() => json({ results: NEARBY }));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(screen.getByRole('status')).toHaveTextContent('Finding your location…');
    expect(useLocation()).toBeDisabled();
  });

  it('explains how to turn location on when it is denied, and asks again only on a tap', async () => {
    const ask = fakeLocation({ code: 1 }, JOO_CHIAT);
    const fetch = fakeFetch(() => json({ results: NEARBY }));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Location is off for this app.*allow location for this site.*search for a stop below/,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(1);

    await userEvent.click(useLocation());

    expect(await screen.findAllByRole('link')).toHaveLength(2);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [2, /couldn’t be found.*location is on for your device/],
    [3, /took too long/],
  ] as const)('explains browser error %i and points to search', async (code, message) => {
    fakeLocation({ code });
    const fetch = fakeFetch(() => json({ results: NEARBY }));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).toHaveTextContent(/search for a stop below/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says so when the browser cannot share location at all', async () => {
    noLocation();
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByRole('alert')).toHaveTextContent(/can’t share your location/);
  });

  it('says when no stop is within 500 m', async () => {
    fakeLocation(JOO_CHIAT);
    fakeFetch(() => json({ results: [] }));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByText(/No bus stops within 500 m/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains a position outside Singapore, which the API rejects', async () => {
    fakeLocation({ latitude: 3.139, longitude: 101.6869 });
    fakeFetch(() => apiError(400, 'VALIDATION_FAILED'));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByRole('alert')).toHaveTextContent(/outside Singapore/);
  });

  it.each([
    [429, 'RATE_LIMITED', /Too many requests/],
    [500, 'INTERNAL', /aren’t available right now/],
  ])('handles a %i answer', async (status, code, message) => {
    fakeLocation(JOO_CHIAT);
    fakeFetch(() => apiError(status, code));
    render(<NearbyStops />);

    await userEvent.click(useLocation());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(useLocation()).toBeEnabled();
  });

  it('says the server is waking up when it is slow to answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fakeLocation(JOO_CHIAT);
    fakeFetch(never);
    render(<NearbyStops />);

    await userEvent.click(useLocation());
    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(screen.getByRole('status')).toHaveTextContent('Waking up the server');
  });
});
