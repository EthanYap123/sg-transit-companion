import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../../src/stops/geo.js';

const HOTEL_GRAND_PACIFIC = { latitude: 1.29684825487647, longitude: 103.85253591654006 }; // 01012
const ST_JOSEPHS_CH = { latitude: 1.29770970610083, longitude: 103.8532247463225 }; // 01013
const QUEEN_ST_TER = { latitude: 1.30358577565355, longitude: 103.85650372998224 }; // 01109

/**
 * Flat-earth distance, a different formula from the one under test. At a few hundred metres near
 * the equator it agrees with the great-circle distance to a few centimetres.
 */
function flatMeters(a: typeof HOTEL_GRAND_PACIFIC, b: typeof HOTEL_GRAND_PACIFIC): number {
  const metresPerDegree = 111_195.08;
  const meanLat = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const dy = (b.latitude - a.latitude) * metresPerDegree;
  const dx = (b.longitude - a.longitude) * metresPerDegree * Math.cos(meanLat);
  return Math.hypot(dx, dy);
}

describe('distanceMeters', () => {
  it('is zero for the same point and the same in both directions', () => {
    expect(distanceMeters(HOTEL_GRAND_PACIFIC, HOTEL_GRAND_PACIFIC)).toBe(0);
    expect(distanceMeters(HOTEL_GRAND_PACIFIC, QUEEN_ST_TER)).toBeCloseTo(
      distanceMeters(QUEEN_ST_TER, HOTEL_GRAND_PACIFIC),
      6,
    );
  });

  it('gives about 111.2 km for one degree along a meridian or the equator', () => {
    expect(distanceMeters({ latitude: 1, longitude: 103 }, { latitude: 2, longitude: 103 })).toBeCloseTo(
      111_195.08,
      1,
    );
    expect(distanceMeters({ latitude: 0, longitude: 103 }, { latitude: 0, longitude: 104 })).toBeCloseTo(
      111_195.08,
      1,
    );
  });

  it('matches a flat-earth check for real stops a short walk apart', () => {
    // Worked by hand too: 0.000861° north and 0.000689° east of Hotel Grand Pacific is about 123 m.
    expect(distanceMeters(HOTEL_GRAND_PACIFIC, ST_JOSEPHS_CH)).toBeCloseTo(
      flatMeters(HOTEL_GRAND_PACIFIC, ST_JOSEPHS_CH),
      1,
    );
    expect(Math.round(distanceMeters(HOTEL_GRAND_PACIFIC, ST_JOSEPHS_CH))).toBe(123);
    expect(distanceMeters(HOTEL_GRAND_PACIFIC, QUEEN_ST_TER)).toBeCloseTo(
      flatMeters(HOTEL_GRAND_PACIFIC, QUEEN_ST_TER),
      1,
    );
  });
});
