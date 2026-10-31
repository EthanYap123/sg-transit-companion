import type { LtaBusArrival, LtaNextBus } from '../lta/schemas.js';

export type BusLoad = 'SEATS_AVAILABLE' | 'STANDING_AVAILABLE' | 'LIMITED_STANDING';
export type BusType = 'SINGLE_DECK' | 'DOUBLE_DECK' | 'BENDY';

export interface Bus {
  estimatedArrival: string;
  minutesAway: number;
  monitored: boolean;
  load: BusLoad | null;
  wheelchairAccessible: boolean;
  type: BusType | null;
  visitNumber: number;
  originCode: string;
  destinationCode: string;
}

export interface ServiceArrivals {
  serviceNo: string;
  operator: string;
  buses: Bus[];
}

export interface StopArrivals {
  stopCode: string;
  fetchedAt: string;
  services: ServiceArrivals[];
}

const LOADS: Record<string, BusLoad> = {
  SEA: 'SEATS_AVAILABLE',
  SDA: 'STANDING_AVAILABLE',
  LSD: 'LIMITED_STANDING',
};

const TYPES: Record<string, BusType> = {
  SD: 'SINGLE_DECK',
  DD: 'DOUBLE_DECK',
  BD: 'BENDY',
};

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO 8601 in Singapore time, e.g. 2026-10-31T17:03:10+08:00 (Singapore has no daylight saving). */
export function toSgtIso(date: Date): string {
  return `${new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/** Orders service numbers the way they appear on stop signs: 2, 10, 10e, 12, 185, 185A, NR1. */
export function compareServiceNo(a: string, b: string): number {
  const [, aNum = '', aRest = ''] = /^(\d*)(.*)$/.exec(a) ?? [];
  const [, bNum = '', bRest = ''] = /^(\d*)(.*)$/.exec(b) ?? [];
  if (aNum && bNum && aNum !== bNum) return Number(aNum) - Number(bNum);
  if (Boolean(aNum) !== Boolean(bNum)) return aNum ? -1 : 1;
  return aRest.localeCompare(bRest, 'en', { sensitivity: 'base' }) || a.localeCompare(b);
}

function normaliseBus(raw: LtaNextBus, fetchedAtMs: number): Bus | null {
  const etaMs = Date.parse(raw.EstimatedArrival);
  if (!raw.EstimatedArrival || Number.isNaN(etaMs)) return null;

  return {
    estimatedArrival: toSgtIso(new Date(etaMs)),
    minutesAway: Math.max(0, Math.floor((etaMs - fetchedAtMs) / 60_000)),
    monitored: raw.Monitored === 1,
    load: LOADS[raw.Load] ?? null,
    wheelchairAccessible: raw.Feature === 'WAB',
    type: TYPES[raw.Type] ?? null,
    visitNumber: Number.parseInt(raw.VisitNumber, 10) || 1,
    originCode: raw.OriginCode,
    destinationCode: raw.DestinationCode,
  };
}

/** Turns LTA's raw Bus Arrival response into the shape documented in docs/API.md. */
export function normaliseArrivals(raw: LtaBusArrival, fetchedAt: Date): StopArrivals {
  const fetchedAtMs = fetchedAt.getTime();

  const services = raw.Services.map((service) => ({
    serviceNo: service.ServiceNo,
    operator: service.Operator,
    buses: [service.NextBus, service.NextBus2, service.NextBus3]
      .map((bus) => normaliseBus(bus, fetchedAtMs))
      .filter((bus): bus is Bus => bus !== null)
      .sort((a, b) => Date.parse(a.estimatedArrival) - Date.parse(b.estimatedArrival)),
  })).sort((a, b) => compareServiceNo(a.serviceNo, b.serviceNo));

  return { stopCode: raw.BusStopCode, fetchedAt: toSgtIso(fetchedAt), services };
}
