import type { Stop } from './stop.js';

/** Words people type in full that LTA abbreviates in stop names. */
const ABBREVIATIONS: Record<string, string> = {
  after: 'aft',
  avenue: 'ave',
  before: 'bef',
  block: 'blk',
  building: 'bldg',
  centre: 'ctr',
  center: 'ctr',
  complex: 'cplx',
  drive: 'dr',
  interchange: 'int',
  jalan: 'jln',
  library: 'lib',
  mosque: 'mque',
  national: 'natl',
  north: 'nth',
  opposite: 'opp',
  polytechnic: 'poly',
  primary: 'pr',
  road: 'rd',
  school: 'sch',
  secondary: 'sec',
  singapore: 'spore',
  square: 'sq',
  station: 'stn',
  street: 'st',
  terminal: 'ter',
};

interface Entry {
  stop: Stop;
  description: string;
  roadName: string;
  /** Words of the description, then of the road name. */
  words: string[];
  descriptionWordCount: number;
}

/** Lowercase words; apostrophes are dropped so LTA's "S'pore" reads as "spore". */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenMatches(token: string, word: string): boolean {
  return word.startsWith(token) || word === ABBREVIATIONS[token];
}

/**
 * In-memory bus stop search (about 5,000 stops). Runs without LTA or the database, so search keeps
 * working when either is down and costs no Redis commands. See docs/ARCHITECTURE.md, "Bus stop data".
 */
export class StopIndex {
  private entries: Entry[] = [];
  private byCode = new Map<string, Stop>();

  constructor(stops: Stop[] = []) {
    this.replace(stops);
  }

  get size(): number {
    return this.entries.length;
  }

  replace(stops: Stop[]): void {
    this.entries = stops.map((stop) => {
      const description = normalise(stop.description);
      const roadName = normalise(stop.roadName);
      const descriptionWords = description.split(' ').filter(Boolean);
      return {
        stop,
        description,
        roadName,
        words: [...descriptionWords, ...roadName.split(' ').filter(Boolean)],
        descriptionWordCount: descriptionWords.length,
      };
    });
    this.byCode = new Map(stops.map((stop) => [stop.code, stop]));
  }

  all(): Stop[] {
    return this.entries.map((e) => e.stop);
  }

  get(code: string): Stop | undefined {
    return this.byCode.get(code);
  }

  /**
   * Ranks: exact code, then code prefix, then names starting with the query, then stops whose words
   * (name and road) start with every query word, so "vic st" finds "Victoria St". Names that start
   * with the first word beat matches elsewhere, so a stop called "Jurong East Int" beats one that is
   * only on a Jurong East road. Ties go to shorter names: "Tampines Int" before "Tampines Concourse Int".
   */
  search(query: string, limit = 20): Stop[] {
    const q = normalise(query);
    if (!q) return [];
    const tokens = q.split(' ');
    const ranked: Array<{ rank: number; entry: Entry }> = [];

    for (const entry of this.entries) {
      const rank = this.rank(entry, q, tokens);
      if (rank !== null) ranked.push({ rank, entry });
    }

    return ranked
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.entry.descriptionWordCount - b.entry.descriptionWordCount ||
          a.entry.description.localeCompare(b.entry.description) ||
          a.entry.stop.code.localeCompare(b.entry.stop.code),
      )
      .slice(0, limit)
      .map((r) => r.entry.stop);
  }

  private rank(entry: Entry, q: string, tokens: string[]): number | null {
    const { code } = entry.stop;
    if (code === q) return 0;
    if (/^\d+$/.test(q)) return code.startsWith(q) ? 1 : null;
    if (entry.description.startsWith(q)) return 2;
    if (!tokens.every((token) => entry.words.some((word) => tokenMatches(token, word)))) return null;
    const [first = ''] = tokens;
    const [firstWord = ''] = entry.words;
    return entry.descriptionWordCount > 0 && tokenMatches(first, firstWord) ? 3 : 4;
  }
}
