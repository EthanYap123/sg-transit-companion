'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError, searchStops, type Stop } from '@/lib/api';
import { callWhileWaking } from '@/lib/wake';

type Status = 'idle' | 'searching' | 'waking' | 'done' | 'rate-limited' | 'error';

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

/** Search by stop code, name or road (PRD US-01). */
export function StopSearch() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<Stop[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);

  function cancelPending() {
    clearTimeout(timer.current);
    inFlight.current?.abort();
  }

  useEffect(() => cancelPending, []);

  async function run(term: string) {
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const stops = await callWhileWaking(() => searchStops(term, controller.signal), {
        signal: controller.signal,
        onWaking: () => setStatus('waking'),
      });
      if (controller.signal.aborted) return;
      setResults(stops);
      setStatus('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus(err instanceof ApiError && err.status === 429 ? 'rate-limited' : 'error');
    }
  }

  function search(value: string) {
    cancelPending();
    const term = value.trim();
    if (term.length < MIN_LENGTH) {
      setResults([]);
      setStatus('idle');
      return;
    }
    setStatus('searching');
    timer.current = setTimeout(() => void run(term), DEBOUNCE_MS);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    search(event.target.value);
  }

  const term = query.trim();

  return (
    <section aria-label="Find a bus stop">
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="field-label" htmlFor="stop-search">
          Stop code, name or road
        </label>
        <input
          id="stop-search"
          className="search-input"
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="e.g. 83139 or Tampines Int"
          maxLength={50}
          value={query}
          onChange={onChange}
        />
      </form>

      <div role="status" className="search-status">
        {status === 'searching' && 'Searching…'}
        {status === 'waking' && 'Waking up the server, this can take up to a minute…'}
        {status === 'done' &&
          results.length > 0 &&
          `${results.length} ${results.length === 1 ? 'stop' : 'stops'} found`}
        {status === 'done' && results.length === 0 && (
          <>
            <strong>No stops match “{term}”.</strong> Try the 5-digit code on the sign at the stop.
          </>
        )}
      </div>

      {status === 'rate-limited' && (
        <div className="notice notice-warn" role="alert">
          <p>Too many searches. Please wait a minute, then try again.</p>
          <button type="button" className="button" onClick={() => search(query)}>
            Try again
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="notice notice-error" role="alert">
          <p>Search isn’t available right now.</p>
          <button type="button" className="button" onClick={() => search(query)}>
            Try again
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="stop-list">
          {results.map((stop) => (
            <li key={stop.code}>
              <Link href={`/stops/${stop.code}`} className="stop-link">
                <span className="stop-code">{stop.code}</span>
                <span className="stop-name">
                  <strong>{stop.description}</strong>
                  <span>{stop.roadName}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
