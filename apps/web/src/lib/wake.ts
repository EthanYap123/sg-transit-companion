import { ApiError } from './api';

export interface WakeOptions {
  /** Called once if there is still no answer after `wakingAfterMs`. */
  onWaking: () => void;
  signal?: AbortSignal;
  wakingAfterMs?: number;
  giveUpAfterMs?: number;
}

/**
 * The API sleeps on Render's free plan and takes about a minute to wake (PRD US-05). No answer, or a
 * gateway error from Render, means "try again". LTA being down is a real answer, so it is not retried.
 */
export function isWakingError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'NETWORK') return true;
  return [502, 503, 504].includes(err.status) && err.code === 'UNKNOWN';
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Calls the API, retrying with backoff (1, 2, 4, 8, 8… s) for up to 90 s while the server wakes. */
export async function callWhileWaking<T>(call: () => Promise<T>, options: WakeOptions): Promise<T> {
  const { onWaking, signal, wakingAfterMs = 3_000, giveUpAfterMs = 90_000 } = options;
  const startedAt = Date.now();
  const wakingTimer = setTimeout(onWaking, wakingAfterMs);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call();
      } catch (err) {
        if (signal?.aborted || !isWakingError(err) || Date.now() - startedAt >= giveUpAfterMs) throw err;
        await wait(Math.min(1_000 * 2 ** attempt, 8_000), signal);
      }
    }
  } finally {
    clearTimeout(wakingTimer);
  }
}
