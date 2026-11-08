'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { Favourite } from '@/lib/api';
import { formatMinutesAway, minutesUntil } from '@/lib/arrival';
import { useArrivals } from '@/lib/use-arrivals';
import { useFavourites } from '@/lib/use-favourites';

/** How many saved stops show live times without a tap (PRD US-08). */
const LIVE_CARDS = 3;
const LIMIT = 20;

const nameOf = (f: Favourite) => f.label ?? f.stop.description;

/** "Your stops" on the home screen: live times for the first three, and editing. */
export function FavouritesPanel() {
  const favs = useFavourites();
  const [editing, setEditing] = useState(false);

  if (favs.status === 'loading') return null;

  if (favs.status === 'signed-out') {
    return (
      <section className="favourites" aria-labelledby="favourites-title">
        <h2 id="favourites-title">Your stops</h2>
        <p className="favourites-hint">
          <button type="button" className="link-button" onClick={() => void signIn('google')}>
            Sign in
          </button>{' '}
          to save stops and see their buses here.
        </p>
      </section>
    );
  }

  return (
    <section className="favourites" aria-labelledby="favourites-title">
      <div className="favourites-head">
        <h2 id="favourites-title">Your stops</h2>
        {favs.status === 'ready' && favs.favourites.length > 0 && (
          <button type="button" className="link-button" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {favs.status === 'waking' && <p role="status">Waking up the server, this can take up to a minute…</p>}
      {favs.status === 'error' && (
        <div className="notice notice-error" role="alert">
          <p>Your saved stops couldn’t load.</p>
          <button type="button" className="button" onClick={favs.reload}>
            Try again
          </button>
        </div>
      )}
      {favs.actionError && (
        <p className="notice notice-error" role="alert">
          {favs.actionError}
        </p>
      )}

      {favs.status === 'ready' && favs.favourites.length === 0 && (
        <p className="favourites-hint">No saved stops yet. Open a stop and tap ☆ Save stop.</p>
      )}

      {favs.status === 'ready' && favs.favourites.length > 0 && !editing && (
        <ul className="favourite-list">
          {favs.favourites.map((f, i) =>
            i < LIVE_CARDS ? <LiveCard key={f.id} favourite={f} /> : <PlainRow key={f.id} favourite={f} />,
          )}
        </ul>
      )}

      {favs.status === 'ready' && editing && (
        <>
          <p className="favourites-hint">
            {favs.favourites.length} of {LIMIT} saved. The first {LIVE_CARDS} show live times.
          </p>
          <ul className="favourite-list">
            {favs.favourites.map((f, i) => (
              <EditRow
                key={f.id}
                favourite={f}
                first={i === 0}
                last={i === favs.favourites.length - 1}
                busy={favs.busy}
                onRename={(label) => favs.rename(f.id, label)}
                onMove={(by) => favs.move(f.id, by)}
                onRemove={() => favs.remove(f.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StopTitle({ favourite }: { favourite: Favourite }) {
  return (
    <span className="favourite-title">
      <strong>{nameOf(favourite)}</strong>
      <span>
        {favourite.stop.code} · {favourite.stop.roadName}
      </span>
    </span>
  );
}

function LiveCard({ favourite }: { favourite: Favourite }) {
  return (
    <li className="favourite-card">
      <Link href={`/stops/${favourite.stop.code}`} className="favourite-link">
        <StopTitle favourite={favourite} />
        {favourite.stop.inService ? (
          <NextBuses code={favourite.stop.code} />
        ) : (
          <span className="favourite-times">No longer served</span>
        )}
      </Link>
    </li>
  );
}

/** The soonest bus of up to four services, refreshed like the stop page. */
function NextBuses({ code }: { code: string }) {
  const { phase, data } = useArrivals(code);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (phase !== 'ready' || !data) {
    const text = phase === 'unavailable' ? 'Live times unavailable' : 'Loading…';
    return <span className="favourite-times">{text}</span>;
  }

  const soonest = data.services
    .filter((s) => s.buses.length > 0)
    .map((s) => ({ serviceNo: s.serviceNo, minutes: minutesUntil(s.buses[0]!.estimatedArrival, now) }))
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 4);

  if (soonest.length === 0) return <span className="favourite-times">No buses right now</span>;
  return (
    <span className="favourite-times">
      {soonest.map((s) => (
        <span key={s.serviceNo} className="favourite-time">
          <strong>{s.serviceNo}</strong> {formatMinutesAway(s.minutes)}
        </span>
      ))}
    </span>
  );
}

function PlainRow({ favourite }: { favourite: Favourite }) {
  return (
    <li className="favourite-card">
      <Link href={`/stops/${favourite.stop.code}`} className="favourite-link">
        <StopTitle favourite={favourite} />
      </Link>
    </li>
  );
}

interface EditRowProps {
  favourite: Favourite;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (label: string) => Promise<void>;
  onMove: (by: -1 | 1) => Promise<void>;
  onRemove: () => Promise<void>;
}

function EditRow({ favourite, first, last, busy, onRename, onMove, onRemove }: EditRowProps) {
  const [label, setLabel] = useState(favourite.label ?? '');
  const name = nameOf(favourite);
  const changed = label.trim() !== (favourite.label ?? '');

  return (
    <li className="favourite-card favourite-edit">
      <form
        className="favourite-rename"
        onSubmit={(event) => {
          event.preventDefault();
          void onRename(label);
        }}
      >
        <label htmlFor={`label-${favourite.id}`}>
          Name for {favourite.stop.description} ({favourite.stop.code})
        </label>
        <div className="favourite-rename-row">
          <input
            id={`label-${favourite.id}`}
            className="search-input"
            value={label}
            maxLength={30}
            placeholder={favourite.stop.description}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit" className="button button-quiet" disabled={busy || !changed}>
            Save
          </button>
        </div>
      </form>
      <div className="button-row">
        <button
          type="button"
          className="button button-quiet"
          aria-label={`Move ${name} up`}
          disabled={busy || first}
          onClick={() => void onMove(-1)}
        >
          ↑ Up
        </button>
        <button
          type="button"
          className="button button-quiet"
          aria-label={`Move ${name} down`}
          disabled={busy || last}
          onClick={() => void onMove(1)}
        >
          ↓ Down
        </button>
        <button
          type="button"
          className="button button-danger"
          aria-label={`Remove ${name}`}
          disabled={busy}
          onClick={() => void onRemove()}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
