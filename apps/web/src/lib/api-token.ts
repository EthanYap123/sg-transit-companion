/** Refetch a little early, so a token cannot expire on its way to the API. */
const EARLY_REFRESH_MS = 30_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Held in memory only, never in localStorage, so it disappears with the page. */
let cached: CachedToken | null = null;

/** The API token for the signed-in user, or null when signed out. */
export async function getApiToken(): Promise<string | null> {
  if (cached && cached.expiresAt - EARLY_REFRESH_MS > Date.now()) return cached.token;
  const res = await fetch('/api/token');
  if (res.status === 401) {
    cached = null;
    return null;
  }
  if (!res.ok) throw new Error(`Could not get a sign-in token (${res.status})`);
  cached = (await res.json()) as CachedToken;
  return cached.token;
}

/** Forget the token, for signing out or deleting the account. */
export function clearApiToken(): void {
  cached = null;
}
