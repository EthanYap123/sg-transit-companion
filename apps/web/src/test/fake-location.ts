import { vi } from 'vitest';

type Answer = { latitude: number; longitude: number } | { code: 1 | 2 | 3 } | 'never';

/**
 * Replaces `navigator.geolocation`. Each call to getCurrentPosition takes the next answer (the last
 * one repeats): a position, a GeolocationPositionError code (1 denied, 2 unavailable, 3 timeout), or
 * 'never' for a browser still waiting on the user.
 */
export function fakeLocation(...answers: Answer[]) {
  const queue = [...answers];
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success, failure) => {
    const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (answer === 'never') return;
    queueMicrotask(() => {
      if ('code' in answer) failure?.({ code: answer.code, message: 'Failed' } as GeolocationPositionError);
      else success({ coords: answer, timestamp: Date.now() } as unknown as GeolocationPosition);
    });
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
  return getCurrentPosition;
}

/** A browser with no location feature at all. */
export function noLocation() {
  Reflect.deleteProperty(navigator, 'geolocation');
}
