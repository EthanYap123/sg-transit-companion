import { z } from 'zod';
import type { LtaBusStop } from '../lta/schemas.js';

export const stopCodeSchema = z.string().regex(/^\d{5}$/, 'must be a 5-digit bus stop code');

export interface Stop {
  code: string;
  description: string;
  roadName: string;
  latitude: number;
  longitude: number;
}

const STOP_CODE = /^\d{5}$/;

/** Converts LTA's stop records, dropping malformed codes and duplicates (the first one wins). */
export function stopsFromLta(records: LtaBusStop[]): Stop[] {
  const seen = new Set<string>();
  const stops: Stop[] = [];
  for (const r of records) {
    const code = r.BusStopCode.trim();
    if (!STOP_CODE.test(code) || seen.has(code)) continue;
    seen.add(code);
    stops.push({
      code,
      description: r.Description.trim(),
      roadName: r.RoadName.trim(),
      latitude: r.Latitude,
      longitude: r.Longitude,
    });
  }
  return stops;
}
