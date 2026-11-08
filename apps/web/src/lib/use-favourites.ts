import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import {
  addFavourite,
  ApiError,
  listFavourites,
  removeFavourite,
  renameFavourite,
  reorderFavourites,
  type Favourite,
} from './api';
import { getApiToken } from './api-token';
import { callWhileWaking } from './wake';

export type FavouritesStatus = 'signed-out' | 'loading' | 'waking' | 'ready' | 'error';

export interface UseFavourites {
  status: FavouritesStatus;
  favourites: Favourite[];
  /** The last change that failed, in words the user can act on. Cleared by the next change. */
  actionError: string | null;
  busy: boolean;
  add: (busStopCode: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
  move: (id: string, by: -1 | 1) => Promise<void>;
  reload: () => void;
}

async function token(): Promise<string> {
  const value = await getApiToken();
  if (!value) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.');
  return value;
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return err.message;
  if (err instanceof ApiError && err.status === 429) return 'Too many changes. Please wait a moment.';
  if (err instanceof ApiError && err.status === 401) return 'Please sign in again.';
  return 'That didn’t save. Please try again.';
}

/** The signed-in user's saved stops (PRD US-08), loaded once per page and kept in step after each change. */
export function useFavourites(): UseFavourites {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<Exclude<FavouritesStatus, 'signed-out'>>('loading');
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const signedIn = sessionStatus === 'authenticated';

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    callWhileWaking(async () => listFavourites(await token(), controller.signal), {
      signal: controller.signal,
      onWaking: () => setStatus('waking'),
    }).then(
      (list) => {
        setFavourites(list);
        setStatus('ready');
      },
      () => {
        if (!controller.signal.aborted) setStatus('error');
      },
    );
    return () => controller.abort();
  }, [signedIn, attempt]);

  const change = useCallback(async (work: (token: string) => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await work(await token());
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const add = useCallback(
    (busStopCode: string) =>
      change(async (t) => {
        const saved = await addFavourite(t, busStopCode);
        setFavourites((list) => [...list, saved]);
      }),
    [change],
  );

  const remove = useCallback(
    (id: string) =>
      change(async (t) => {
        await removeFavourite(t, id);
        setFavourites((list) => list.filter((f) => f.id !== id));
      }),
    [change],
  );

  const rename = useCallback(
    (id: string, label: string) =>
      change(async (t) => {
        const updated = await renameFavourite(t, id, label.trim() || null);
        setFavourites((list) => list.map((f) => (f.id === id ? updated : f)));
      }),
    [change],
  );

  const move = useCallback(
    (id: string, by: -1 | 1) =>
      change(async (t) => {
        const ids = favourites.map((f) => f.id);
        const from = ids.indexOf(id);
        const to = from + by;
        if (from < 0 || to < 0 || to >= ids.length) return;
        [ids[from], ids[to]] = [ids[to]!, ids[from]!];
        setFavourites(await reorderFavourites(t, ids));
      }),
    [change, favourites],
  );

  const reload = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  if (sessionStatus === 'loading') {
    return { status: 'loading', favourites: [], actionError, busy, add, remove, rename, move, reload };
  }
  return {
    status: signedIn ? status : 'signed-out',
    favourites: signedIn ? favourites : [],
    actionError,
    busy,
    add,
    remove,
    rename,
    move,
    reload,
  };
}
