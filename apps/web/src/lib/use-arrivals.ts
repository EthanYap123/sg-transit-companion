import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getArrivals, type StopArrivals } from './api';
import { callWhileWaking } from './wake';

/** How long the API treats arrivals as fresh, matching LTA's update frequency. */
const SERVER_FRESH_MS = 20_000;
/** Just past that, so the next refresh gets new data instead of the same cached answer. */
const MAX_REFRESH_MS = SERVER_FRESH_MS + 1_000;
/** Responses may be cached by the browser for 10 s, so sooner than this would change nothing. */
const MIN_REFRESH_MS = 11_000;
/** Wait before trying again after a failure. */
const RETRY_MS = 20_000;
/** A refresh that takes this long counts as failed, so a hung request cannot hide old times. */
const REFRESH_TIMEOUT_MS = 15_000;
/** Times older than this are no use to anyone waiting for a bus. */
const MAX_DATA_AGE_MS = 10 * 60_000;

export type ArrivalsPhase = 'loading' | 'waking' | 'ready' | 'unavailable' | 'not-found';

export interface ArrivalsState {
  phase: ArrivalsPhase;
  data: StopArrivals | null;
  /** The last refresh failed, so `data` is what was shown before. */
  refreshFailed: boolean;
}

const isNotFound = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 400);

/**
 * When to refresh next. The API caches each stop for 20 s, so refreshing on a fixed 20 s timer lands
 * just inside that window and every other refresh returns the same data. Timing it from when the data
 * was fetched keeps it about 20 s old at most, even if another user's request filled the cache.
 */
export function nextRefreshDelay(fetchedAt: string, now: number): number {
  const delay = Date.parse(fetchedAt) + MAX_REFRESH_MS - now;
  return Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, delay));
}

/**
 * Live arrivals for one stop (PRD US-02 to US-05). Refreshes about every 20 s while the page is
 * visible, pauses while it is hidden, and refreshes at once on return. A failed refresh keeps the
 * last times until they are too old to be useful.
 */
export function useArrivals(code: string): ArrivalsState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<ArrivalsState>({
    phase: 'loading',
    data: null,
    refreshFailed: false,
  });
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown: StopArrivals | null = null;

    function fetchArrivals(current: AbortController) {
      if (shown) {
        const timedOut = new AbortController();
        const timeout = setTimeout(() => timedOut.abort(), REFRESH_TIMEOUT_MS);
        return getArrivals(code, AbortSignal.any([current.signal, timedOut.signal])).finally(() =>
          clearTimeout(timeout),
        );
      }
      return callWhileWaking(() => getArrivals(code, current.signal), {
        signal: current.signal,
        onWaking: () => setState((previous) => ({ ...previous, phase: 'waking' })),
      });
    }

    async function load() {
      clearTimeout(timer);
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const data = await fetchArrivals(current);
        if (current.signal.aborted) return;
        shown = data;
        setState({ phase: 'ready', data, refreshFailed: false });
        timer = setTimeout(() => void load(), nextRefreshDelay(data.fetchedAt, Date.now()));
      } catch (err) {
        if (current.signal.aborted) return;
        if (isNotFound(err)) {
          shown = null;
          setState({ phase: 'not-found', data: null, refreshFailed: false });
          return;
        }
        if (shown && Date.now() - Date.parse(shown.fetchedAt) < MAX_DATA_AGE_MS) {
          setState((previous) => ({ ...previous, refreshFailed: true }));
        } else {
          shown = null;
          setState({ phase: 'unavailable', data: null, refreshFailed: false });
        }
        timer = setTimeout(() => void load(), RETRY_MS);
      }
    }

    function stop() {
      clearTimeout(timer);
      controller?.abort();
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
      else void load();
    }

    refreshRef.current = load;
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) void load();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
  }, [code]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { ...state, refresh };
}
