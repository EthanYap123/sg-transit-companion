import { afterEach, describe, expect, it } from 'vitest';
import { fakeLocation, noLocation } from '@/test/fake-location';
import { getCurrentPosition, LocationError } from './location';

afterEach(noLocation);

describe('getCurrentPosition', () => {
  it('returns the coordinates, asking for a precise fix up to a minute old', async () => {
    const ask = fakeLocation({ latitude: 1.3155, longitude: 103.9059 });

    await expect(getCurrentPosition()).resolves.toEqual({ latitude: 1.3155, longitude: 103.9059 });
    expect(ask.mock.calls[0]?.[2]).toEqual({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ] as const)('turns browser error %i into "%s"', async (code, reason) => {
    fakeLocation({ code });

    const err: unknown = await getCurrentPosition().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LocationError);
    expect((err as LocationError).reason).toBe(reason);
  });

  it('says "unsupported" when the browser has no location feature', async () => {
    noLocation();

    await expect(getCurrentPosition()).rejects.toMatchObject({ reason: 'unsupported' });
  });
});
