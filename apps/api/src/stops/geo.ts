/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;
/** Metres in one degree of latitude on that sphere (about 111.2 km). */
export const METRES_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;

export interface Point {
  latitude: number;
  longitude: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in metres. Accurate to well under a metre at bus stop scale. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
