'use client';

import { signIn } from 'next-auth/react';
import { useFavourites } from '@/lib/use-favourites';

/** Star a stop so it appears on the home screen (PRD US-08). Signed out, it offers sign-in first. */
export function SaveStopButton({ code }: { code: string }) {
  const { status, favourites, add, remove, busy, actionError } = useFavourites();
  const saved = favourites.find((f) => f.stop.code === code);

  if (status === 'signed-out') {
    return (
      <div className="save-stop">
        <button
          type="button"
          className="button button-quiet"
          onClick={() => void signIn('google', { redirectTo: `/stops/${code}` })}
        >
          ☆ Sign in to save this stop
        </button>
      </div>
    );
  }

  const ready = status === 'ready';
  return (
    <div className="save-stop">
      <button
        type="button"
        className={`button ${saved ? '' : 'button-quiet'}`}
        aria-pressed={Boolean(saved)}
        disabled={!ready || busy}
        onClick={() => void (saved ? remove(saved.id) : add(code))}
      >
        {saved ? '★ Saved' : '☆ Save stop'}
      </button>
      {actionError && (
        <p className="notice notice-error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
