/** Why the browser gave no position. `unsupported` means it has no location feature at all. */
export type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class LocationError extends Error {
  constructor(readonly reason: LocationFailure) {
    super(`Location ${reason}`);
    this.name = 'LocationError';
  }
}

export interface Position {
  latitude: number;
  longitude: number;
}

const REASONS: Record<number, LocationFailure> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/**
 * Asks the browser for the user's position once. Only called from a tap on "Use my location", so the
 * permission prompt never appears by itself (PRD US-09). A fix up to a minute old is fine for
 * finding stops, and saves battery on a second tap.
 */
export function getCurrentPosition(timeoutMs = 15_000): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new LocationError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (err) => reject(new LocationError(REASONS[err.code] ?? 'unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
