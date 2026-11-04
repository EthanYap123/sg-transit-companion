import type { BusLoad, BusType } from './api';

/** Label shown for a bus that is this many minutes away ("Arr" at one minute or less). */
export function formatMinutesAway(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 1) return 'Arr';
  return `${Math.floor(minutes)} min`;
}

/** Whole minutes from `nowMs` until an ISO time, never below zero, so the countdown stays honest between refreshes. */
export function minutesUntil(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((Date.parse(iso) - nowMs) / 60_000));
}

export const LOAD_LABELS: Record<BusLoad, string> = {
  SEATS_AVAILABLE: 'Seats available',
  STANDING_AVAILABLE: 'Standing only',
  LIMITED_STANDING: 'Limited standing',
};

export const TYPE_LABELS: Record<BusType, string> = {
  SINGLE_DECK: 'Single deck',
  DOUBLE_DECK: 'Double deck',
  BENDY: 'Bendy',
};

/** "17:03" in Singapore time, wherever the viewer is. */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso));
}

/** "just now", "12 s ago", "3 min ago". */
export function formatAgo(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1_000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}
