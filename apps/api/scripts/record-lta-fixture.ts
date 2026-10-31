/**
 * Records a real LTA DataMall response as a test fixture, so tests never call LTA.
 *
 *   npm run fixture:record -w apps/api -- arrival 83139 day
 *   npm run fixture:record -w apps/api -- stops first-page 25
 *
 * Reads LTA_ACCOUNT_KEY from apps/api/.env. The key is sent only to LTA and never written to the fixture.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.LTA_BASE_URL ?? 'https://datamall2.mytransport.sg/ltaodataservice';
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'lta');

async function fetchJson(path: string): Promise<unknown> {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) throw new Error('LTA_ACCOUNT_KEY is not set (add it to apps/api/.env)');
  const res = await fetch(`${BASE_URL}${path}`, { headers: { AccountKey: key, accept: 'application/json' } });
  if (!res.ok) throw new Error(`LTA answered HTTP ${res.status} for ${path}`);
  return res.json();
}

async function save(name: string, body: unknown): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const file = join(FIXTURE_DIR, `${name}.json`);
  await writeFile(file, `${JSON.stringify({ recordedAt: new Date().toISOString(), body }, null, 2)}\n`);
  console.log(`Saved ${file}`);
}

const [kind, arg1, arg2] = process.argv.slice(2);

if (kind === 'arrival' && arg1 && arg2) {
  await save(`bus-arrival-${arg1}-${arg2}`, await fetchJson(`/v3/BusArrival?BusStopCode=${arg1}`));
} else if (kind === 'stops' && arg1) {
  const limit = Number(arg2 ?? 25);
  const body = (await fetchJson('/BusStops')) as { value: unknown[] };
  await save(`bus-stops-${arg1}`, { ...body, value: body.value.slice(0, limit) });
} else {
  console.error('Usage: arrival <stopCode> <label> | stops <label> [limit]');
  process.exit(1);
}
