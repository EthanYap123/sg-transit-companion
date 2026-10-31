import { describe, expect, it } from 'vitest';
import { compareServiceNo, normaliseArrivals, toSgtIso } from '../../src/arrivals/normalise.js';
import { ltaBusArrivalSchema, type LtaNextBus } from '../../src/lta/schemas.js';
import { ltaFixture } from '../helpers/fixtures.js';

const fixture = (name: string) => ltaBusArrivalSchema.parse(ltaFixture(name));
const at = (iso: string) => new Date(iso);

const emptyBus: LtaNextBus = {
  OriginCode: '',
  DestinationCode: '',
  EstimatedArrival: '',
  Monitored: 0,
  Latitude: '',
  Longitude: '',
  VisitNumber: '',
  Load: '',
  Feature: '',
  Type: '',
};

function bus(overrides: Partial<LtaNextBus>): LtaNextBus {
  return {
    ...emptyBus,
    OriginCode: '77009',
    DestinationCode: '77131',
    EstimatedArrival: '2026-10-31T08:05:00+08:00',
    Monitored: 1,
    VisitNumber: '1',
    Load: 'SEA',
    Feature: 'WAB',
    Type: 'DD',
    ...overrides,
  };
}

describe('normaliseArrivals with recorded LTA data', () => {
  it('maps a full suburban stop', () => {
    const result = normaliseArrivals(fixture('bus-arrival-83139-day'), at('2026-10-31T17:00:00+08:00'));

    expect(result.stopCode).toBe('83139');
    expect(result.fetchedAt).toBe('2026-10-31T17:00:00+08:00');
    expect(result.services.map((s) => s.serviceNo)).toEqual(['15', '150', '155']);
    expect(result.services.every((s) => s.buses.length === 3)).toBe(true);
    expect(result.services.map((s) => s.buses[0]!.minutesAway)).toEqual([3, 4, 10]);
    expect(result.services[0]!.buses[0]).toEqual({
      estimatedArrival: '2026-10-31T17:03:10+08:00',
      minutesAway: 3,
      monitored: true,
      load: 'SEATS_AVAILABLE',
      wheelchairAccessible: true,
      type: 'SINGLE_DECK',
      visitNumber: 1,
      originCode: '77139',
      destinationCode: '77009',
    });
  });

  it('marks schedule-based times as not monitored', () => {
    const result = normaliseArrivals(fixture('bus-arrival-83139-day'), at('2026-10-31T17:00:00+08:00'));
    const service150 = result.services.find((s) => s.serviceNo === '150')!;

    expect(service150.buses.map((b) => b.monitored)).toEqual([true, false, false]);
  });

  it('drops the empty second and third bus instead of returning blanks', () => {
    const result = normaliseArrivals(fixture('bus-arrival-01012-city'), at('2026-10-31T17:02:10+08:00'));
    const counts = Object.fromEntries(result.services.map((s) => [s.serviceNo, s.buses.length]));

    expect(counts['12e']).toBe(1);
    expect(counts['32']).toBe(2);
    expect(counts['12']).toBe(3);
    for (const service of result.services) {
      for (const b of service.buses) {
        expect(b.estimatedArrival).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
        expect(b.minutesAway).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('puts services in natural order, not LTA text order', () => {
    const raw = fixture('bus-arrival-01012-city');
    const result = normaliseArrivals(raw, at('2026-10-31T17:02:10+08:00'));

    expect(raw.Services.map((s) => s.ServiceNo).slice(0, 4)).toEqual(['12', '12e', '175', '2']);
    expect(result.services.map((s) => s.serviceNo)).toEqual([
      '2',
      '7',
      '12',
      '12e',
      '32',
      '33',
      '51',
      '61',
      '63',
      '80',
      '175',
    ]);
  });

  it('returns no services when no buses are running', () => {
    const result = normaliseArrivals(fixture('bus-arrival-night'), at('2026-10-31T02:00:00+08:00'));

    expect(result).toEqual({ stopCode: '83139', fetchedAt: '2026-10-31T02:00:00+08:00', services: [] });
  });
});

describe('normaliseArrivals edge cases', () => {
  const stop = (buses: LtaNextBus[]) => ({
    BusStopCode: '01012',
    Services: [
      {
        ServiceNo: '7',
        Operator: 'SBST',
        NextBus: buses[0] ?? emptyBus,
        NextBus2: buses[1] ?? emptyBus,
        NextBus3: buses[2] ?? emptyBus,
      },
    ],
  });
  const fetchedAt = at('2026-10-31T08:00:00+08:00');
  const only = (buses: LtaNextBus[]) => normaliseArrivals(stop(buses), fetchedAt).services[0]!.buses;

  it('floors minutes and never goes below zero', () => {
    const buses = only([
      bus({ EstimatedArrival: '2026-10-31T07:59:30+08:00' }),
      bus({ EstimatedArrival: '2026-10-31T08:01:59+08:00' }),
      bus({ EstimatedArrival: '2026-10-31T08:12:00+08:00' }),
    ]);

    expect(buses.map((b) => b.minutesAway)).toEqual([0, 1, 12]);
  });

  it('sorts buses soonest first', () => {
    const buses = only([
      bus({ EstimatedArrival: '2026-10-31T08:10:00+08:00' }),
      bus({ EstimatedArrival: '2026-10-31T08:03:00+08:00' }),
    ]);

    expect(buses.map((b) => b.minutesAway)).toEqual([3, 10]);
  });

  it('maps every load and deck code, and unknown values to null', () => {
    const buses = only([
      bus({ Load: 'SDA', Type: 'BD' }),
      bus({ Load: 'LSD', Type: 'SD', EstimatedArrival: '2026-10-31T08:06:00+08:00' }),
      bus({ Load: 'XYZ', Type: '', EstimatedArrival: '2026-10-31T08:07:00+08:00' }),
    ]);

    expect(buses.map((b) => [b.load, b.type])).toEqual([
      ['STANDING_AVAILABLE', 'BENDY'],
      ['LIMITED_STANDING', 'SINGLE_DECK'],
      [null, null],
    ]);
  });

  it('reads wheelchair access, monitoring and visit number', () => {
    const [b] = only([bus({ Feature: '', Monitored: 0, VisitNumber: '2' })]);

    expect(b).toMatchObject({ wheelchairAccessible: false, monitored: false, visitNumber: 2 });
  });

  it('defaults a missing monitored flag and visit number', () => {
    const [b] = only([bus({ Monitored: undefined, VisitNumber: '' })]);

    expect(b).toMatchObject({ monitored: false, visitNumber: 1 });
  });

  it('drops a bus whose arrival time cannot be read', () => {
    const buses = only([bus({ EstimatedArrival: 'soon' }), bus({})]);

    expect(buses).toHaveLength(1);
  });

  it('keeps a service with no buses so the UI can say it is not running', () => {
    const result = normaliseArrivals(stop([]), fetchedAt);

    expect(result.services).toEqual([{ serviceNo: '7', operator: 'SBST', buses: [] }]);
  });
});

describe('compareServiceNo', () => {
  it('sorts numbers numerically, then suffixes, then letter-only services', () => {
    const input = ['NR1', '185A', '10e', '2', '185', '10', 'CT8', '12', '963R'];

    expect([...input].sort(compareServiceNo)).toEqual([
      '2',
      '10',
      '10e',
      '12',
      '185',
      '185A',
      '963R',
      'CT8',
      'NR1',
    ]);
  });
});

describe('toSgtIso', () => {
  it('formats a UTC instant as Singapore time', () => {
    expect(toSgtIso(new Date('2026-10-31T16:30:05.123Z'))).toBe('2026-11-01T00:30:05+08:00');
  });
});
