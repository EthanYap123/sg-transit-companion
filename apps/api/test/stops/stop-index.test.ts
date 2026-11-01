import { describe, expect, it } from 'vitest';
import { ltaBusStopsPageSchema } from '../../src/lta/schemas.js';
import { stopsFromLta } from '../../src/stops/stop.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { ltaFixture } from '../helpers/fixtures.js';

const STOPS = stopsFromLta(ltaBusStopsPageSchema.parse(ltaFixture('bus-stops-first-page')).value);
const index = new StopIndex(STOPS);
const codes = (query: string, limit?: number) => index.search(query, limit).map((s) => s.code);

describe('StopIndex.search', () => {
  it('puts an exact stop code first', () => {
    expect(codes('01012')[0]).toBe('01012');
  });

  it('matches code prefixes when the query is digits', () => {
    expect(codes('011').sort()).toEqual(['01109', '01112', '01113', '01119', '01121', '01129', '01139']);
    expect(codes('0112').sort()).toEqual(['01121', '01129']);
    expect(codes('99999')).toEqual([]);
  });

  it('ranks names that start with the query above names that only contain it', () => {
    const results = index.search('bugis');

    expect(results.slice(0, 4).every((s) => s.description.startsWith('Bugis'))).toBe(true);
    expect(results.map((s) => s.code)).toContain('01112');
    expect(results).toHaveLength(6);
  });

  it('matches every word as a prefix, across name and road', () => {
    const results = index.search('vic st');

    expect(results).toHaveLength(11);
    expect(results.every((s) => s.roadName === 'Victoria St')).toBe(true);
  });

  it('understands the full words LTA abbreviates', () => {
    expect(codes('opposite national library')).toEqual(['01029']);
    expect(codes('north bridge')).toHaveLength(5);
    expect(codes('jalan sultan').sort()).toEqual(['01231', '01239']);
  });

  it('ignores case and punctuation', () => {
    expect(codes('ST. JOSEPH')).toEqual(['01013']);
  });

  it('returns nothing for blank or unmatched queries', () => {
    expect(codes('   ')).toEqual([]);
    expect(codes('zzz')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(codes('st', 3)).toHaveLength(3);
  });
});

describe('StopIndex ranking with real stop names', () => {
  const make = (code: string, description: string) => ({
    code,
    description,
    roadName: 'Tampines Ave 5',
    latitude: 1.35,
    longitude: 103.94,
  });
  const tampines = new StopIndex([
    make('76149', 'Opp Tampines Stn/Int'),
    make('75019', 'Tampines Concourse Int'),
    make('75009', 'Tampines Int'),
    make('74009', 'Tampines Nth Int'),
    make('02101', "Aft S'pore Flyer"),
  ]);

  it('prefers names that start with the first word, and shorter names', () => {
    expect(tampines.search('tampines interchange').map((s) => s.description)).toEqual([
      'Tampines Int',
      'Tampines Concourse Int',
      'Tampines Nth Int',
      'Opp Tampines Stn/Int',
    ]);
  });

  it('ranks stops named after a place above stops that are only on its roads', () => {
    const index = new StopIndex([
      { ...make('28439', 'Blk 124'), roadName: 'Jurong East St 13' },
      make('28009', 'Jurong East Int'),
    ]);

    expect(index.search('jurong east').map((s) => s.code)).toEqual(['28009', '28439']);
  });

  it("reads LTA's S'pore as Singapore", () => {
    expect(tampines.search('singapore flyer').map((s) => s.code)).toEqual(['02101']);
    expect(tampines.search("s'pore").map((s) => s.code)).toEqual(['02101']);
  });
});

describe('StopIndex lookups', () => {
  it('finds a stop by code', () => {
    expect(index.get('01012')).toMatchObject({ description: 'Hotel Grand Pacific', roadName: 'Victoria St' });
    expect(index.get('00000')).toBeUndefined();
  });

  it('can be replaced', () => {
    const other = new StopIndex(STOPS);
    expect(other.size).toBe(25);

    other.replace([]);

    expect(other.size).toBe(0);
    expect(other.search('bugis')).toEqual([]);
    expect(other.get('01012')).toBeUndefined();
  });
});

describe('stopsFromLta', () => {
  const record = (code: string, description = 'Blk 1') => ({
    BusStopCode: code,
    Description: ` ${description} `,
    RoadName: ' Victoria St ',
    Latitude: 1.3,
    Longitude: 103.8,
  });

  it('trims text and drops malformed codes and duplicates', () => {
    const stops = stopsFromLta([
      record('01012', 'First'),
      record('01012', 'Duplicate'),
      record('1A'),
      record(''),
    ]);

    expect(stops).toEqual([
      { code: '01012', description: 'First', roadName: 'Victoria St', latitude: 1.3, longitude: 103.8 },
    ]);
  });
});
