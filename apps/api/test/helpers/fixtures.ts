import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Returns the LTA response body stored in test/fixtures/lta/<name>.json. */
export function ltaFixture(name: string): unknown {
  const file = fileURLToPath(new URL(`../fixtures/lta/${name}.json`, import.meta.url));
  return (JSON.parse(readFileSync(file, 'utf8')) as { body: unknown }).body;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
