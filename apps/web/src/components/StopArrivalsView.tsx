'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStop, type Bus, type ServiceArrivals, type Stop } from '@/lib/api';
import {
  LOAD_LABELS,
  TYPE_LABELS,
  formatAgo,
  formatClock,
  formatMinutesAway,
  minutesUntil,
} from '@/lib/arrival';
import { useArrivals } from '@/lib/use-arrivals';
import { SaveStopButton } from './SaveStopButton';

/** Live arrivals for one stop. */
export function StopArrivalsView({ code }: { code: string }) {
  const { phase, data, refreshFailed, refresh } = useArrivals(code);
  const [stop, setStop] = useState<Stop | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // The name is a nice-to-have: the arrivals below work without it.
    getStop(code, controller.signal).then(setStop, () => undefined);
    return () => controller.abort();
  }, [code]);

  // Keeps the countdown and "Updated" text moving between refreshes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    setAnnouncement('');
    await refresh();
    setNow(Date.now());
    setRefreshing(false);
    setAnnouncement('Arrival times updated');
  }

  if (phase === 'not-found') {
    return (
      <>
        <BackLink />
        <h1>Stop not found</h1>
        <p className="lede">
          There is no bus stop with the code “{code}”. Check the code on the sign at the stop.
        </p>
      </>
    );
  }

  return (
    <>
      <BackLink />
      <h1>{stop?.description ?? `Bus stop ${code}`}</h1>
      <p className="lede">
        {code}
        {stop && ` · ${stop.roadName}`}
      </p>
      <SaveStopButton code={code} />

      {phase === 'loading' && <p role="status">Loading arrivals…</p>}
      {phase === 'waking' && <p role="status">Waking up the server, this can take up to a minute…</p>}

      {phase === 'unavailable' && (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>Live arrivals are temporarily unavailable.</strong> You can still search for other stops.
          </p>
          <button type="button" className="button" onClick={() => void onRefresh()} disabled={refreshing}>
            Try again
          </button>
        </div>
      )}

      {phase === 'ready' && data && (
        <>
          <div className="arrivals-toolbar">
            <span>Updated {formatAgo(data.fetchedAt, now)}</span>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => void onRefresh()}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div role="status" className="visually-hidden">
            {announcement}
          </div>

          {data.stale && (
            <p className="notice notice-warn" role="alert">
              <strong>Live data unavailable.</strong> Showing times from {formatClock(data.fetchedAt)}.
            </p>
          )}
          {refreshFailed && !data.stale && (
            <p className="notice notice-warn" role="alert">
              <strong>Couldn’t refresh.</strong> Showing times from {formatClock(data.fetchedAt)}. Trying
              again shortly.
            </p>
          )}

          {data.services.length === 0 ? (
            <p className="notice">No buses in service right now.</p>
          ) : (
            <ul className="service-list">
              {data.services.map((service) => (
                <ServiceCard key={service.serviceNo} service={service} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function BackLink() {
  return (
    <p className="back-link">
      <Link href="/">← Search for a stop</Link>
    </p>
  );
}

function ServiceCard({ service, now }: { service: ServiceArrivals; now: number }) {
  return (
    <li className="service-card">
      <h2 className="service-no">{service.serviceNo}</h2>
      {service.buses.length === 0 ? (
        <p className="service-idle">Not running right now</p>
      ) : (
        <ol className="bus-list">
          {service.buses.map((bus) => (
            <BusItem key={`${bus.estimatedArrival}-${bus.visitNumber}`} bus={bus} now={now} />
          ))}
        </ol>
      )}
    </li>
  );
}

const LOAD_CLASSES = {
  SEATS_AVAILABLE: 'load-seats',
  STANDING_AVAILABLE: 'load-standing',
  LIMITED_STANDING: 'load-limited',
} as const;

function BusItem({ bus, now }: { bus: Bus; now: number }) {
  return (
    <li className="bus">
      <span className="bus-time">{formatMinutesAway(minutesUntil(bus.estimatedArrival, now))}</span>
      {bus.load && <span className={`bus-load ${LOAD_CLASSES[bus.load]}`}>{LOAD_LABELS[bus.load]}</span>}
      {bus.type && <span className="bus-detail">{TYPE_LABELS[bus.type]}</span>}
      {bus.wheelchairAccessible && <span className="bus-detail">Wheelchair OK</span>}
      {!bus.monitored && <span className="bus-scheduled">Scheduled</span>}
    </li>
  );
}
