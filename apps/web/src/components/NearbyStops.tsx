'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, getNearbyStops, type NearbyStop } from '@/lib/api';
import { getCurrentPosition, LocationError, type LocationFailure } from '@/lib/location';
import { callWhileWaking } from '@/lib/wake';

type Status =
  | 'idle'
  | 'locating'
  | 'loading'
  | 'waking'
  | 'done'
  | LocationFailure
  | 'outside'
  | 'rate-limited'
  | 'error';

const BUSY: Status[] = ['locating', 'loading', 'waking'];

/** What to say when there is no list to show. Each one points to the search box below. */
const PROBLEMS: Partial<Record<Status, { tone: 'warn' | 'error'; text: string }>> = {
  denied: {
    tone: 'warn',
    text: 'Location is off for this app. To use it, allow location for this site in your browser settings, then tap “Use my location” again. You can still search for a stop below.',
  },
  unavailable: {
    tone: 'warn',
    text: 'Your location couldn’t be found. Check that location is on for your device, or search for a stop below.',
  },
  timeout: {
    tone: 'warn',
    text: 'Finding your location took too long. Try again, ideally near a window or outdoors, or search for a stop below.',
  },
  unsupported: {
    tone: 'warn',
    text: 'This browser can’t share your location. Search for a stop below instead.',
  },
  outside: {
    tone: 'warn',
    text: 'You seem to be outside Singapore, so there are no bus stops nearby. Search for a stop below instead.',
  },
  'rate-limited': { tone: 'warn', text: 'Too many requests. Please wait a minute, then try again.' },
  error: { tone: 'error', text: 'Nearby stops aren’t available right now. Try again, or search below.' },
};

/**
 * "Use my location" on the home screen (PRD US-09): up to 10 stops within 500 m, nearest first.
 * The browser only asks for permission after a tap, and the position goes to the API in one request
 * that is neither stored nor cached.
 */
export function NearbyStops() {
  const [status, setStatus] = useState<Status>('idle');
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function find() {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus('locating');
    try {
      const { latitude, longitude } = await getCurrentPosition();
      if (controller.signal.aborted) return;
      setStatus('loading');
      const found = await callWhileWaking(() => getNearbyStops(latitude, longitude, controller.signal), {
        signal: controller.signal,
        onWaking: () => setStatus('waking'),
      });
      if (controller.signal.aborted) return;
      setStops(found);
      setStatus('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setStops([]);
      if (err instanceof LocationError) setStatus(err.reason);
      else if (err instanceof ApiError && err.status === 400) setStatus('outside');
      else if (err instanceof ApiError && err.status === 429) setStatus('rate-limited');
      else setStatus('error');
    }
  }

  const busy = BUSY.includes(status);
  const problem = PROBLEMS[status];

  return (
    <section className="nearby" aria-labelledby="nearby-title">
      <div className="nearby-head">
        <h2 id="nearby-title">Stops near you</h2>
        <button
          type="button"
          className={status === 'done' ? 'button button-quiet' : 'button'}
          onClick={() => void find()}
          disabled={busy}
        >
          {status === 'done' ? 'Update' : 'Use my location'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="nearby-hint">
          Find stops within 500 m. Your location is only used for this and is never saved.
        </p>
      )}

      <div role="status" className="search-status">
        {status === 'locating' && 'Finding your location…'}
        {status === 'loading' && 'Finding stops near you…'}
        {status === 'waking' && 'Waking up the server, this can take up to a minute…'}
        {status === 'done' &&
          (stops.length > 0
            ? `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} within 500 m`
            : 'No bus stops within 500 m. Try searching for a stop or road below.')}
      </div>

      {problem && (
        <div className={`notice notice-${problem.tone}`} role="alert">
          <p>{problem.text}</p>
        </div>
      )}

      {status === 'done' && stops.length > 0 && (
        <ul className="stop-list">
          {stops.map((stop) => (
            <li key={stop.code}>
              <Link href={`/stops/${stop.code}`} className="stop-link">
                <span className="stop-code">{stop.code}</span>
                <span className="stop-name">
                  <strong>{stop.description}</strong>
                  <span>{stop.roadName}</span>
                </span>
                <span className="stop-distance">
                  {stop.distanceMeters} m<span className="visually-hidden"> away</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
