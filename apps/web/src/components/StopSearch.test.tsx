import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, fakeFetch, json, never } from '@/test/fake-fetch';
import { StopSearch } from './StopSearch';

const STOPS = [
  {
    code: '75009',
    description: 'Tampines Int',
    roadName: 'Tampines Ctrl 1',
    latitude: 1.35,
    longitude: 103.9,
  },
  {
    code: '76141',
    description: 'Tampines Stn/Int',
    roadName: 'Tampines Ave 4',
    latitude: 1.35,
    longitude: 103.9,
  },
];

const input = () => screen.getByRole('searchbox', { name: 'Stop code, name or road' });

describe('StopSearch', () => {
  it('shows matching stops as links to their arrivals', async () => {
    const fetch = fakeFetch(() => json({ query: 'tampines', results: STOPS }));
    render(<StopSearch />);

    await userEvent.type(input(), 'tampines');

    const link = await screen.findByRole('link', { name: /75009.*Tampines Int.*Tampines Ctrl 1/ });
    expect(link).toHaveAttribute('href', '/stops/75009');
    expect(screen.getByRole('status')).toHaveTextContent('2 stops found');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/v1/stops/search?q=tampines');
  });

  it('waits 300 ms after typing stops, so one search covers the whole word', async () => {
    vi.useFakeTimers();
    const fetch = fakeFetch(() => json({ results: STOPS }));
    render(<StopSearch />);

    for (const value of ['ta', 'tam', 'tamp']) fireEvent.change(input(), { target: { value } });
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(fetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toContain('q=tamp');
  });

  it('does not search for one letter, and clears old results', async () => {
    const fetch = fakeFetch(() => json({ results: STOPS }));
    render(<StopSearch />);
    await userEvent.type(input(), 'ta');
    await screen.findAllByRole('link');
    fetch.mockClear();

    await userEvent.type(input(), '{Backspace}');

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores an older search that answers late', async () => {
    let answerFirst: (response: Response) => void = () => undefined;
    fakeFetch((path) =>
      path.includes('q=ta&') || path.endsWith('q=ta')
        ? new Promise<Response>((resolve) => {
            answerFirst = resolve;
          })
        : json({ results: [STOPS[1]] }),
    );
    render(<StopSearch />);

    await userEvent.type(input(), 'ta');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Searching'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await userEvent.type(input(), 'mpines');
    await screen.findByRole('link', { name: /76141/ });
    answerFirst(json({ results: [STOPS[0]] }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('link', { name: /75009/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches, with a tip', async () => {
    fakeFetch(() => json({ results: [] }));
    render(<StopSearch />);

    await userEvent.type(input(), 'zzz');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No stops match “zzz”.'));
    expect(screen.getByRole('status')).toHaveTextContent('5-digit code');
  });

  it('explains a slow first load while the server wakes up', async () => {
    vi.useFakeTimers();
    fakeFetch(never);
    render(<StopSearch />);

    fireEvent.change(input(), { target: { value: 'tampines' } });
    await act(() => vi.advanceTimersByTimeAsync(300 + 2_999));
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByRole('status')).toHaveTextContent('Waking up the server');
  });

  it('shows an error with a working retry button', async () => {
    let healthy = false;
    fakeFetch(() => (healthy ? json({ results: STOPS }) : apiError(500, 'INTERNAL')));
    render(<StopSearch />);

    await userEvent.type(input(), 'tampines');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search isn’t available right now.');

    healthy = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('link', { name: /75009/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
