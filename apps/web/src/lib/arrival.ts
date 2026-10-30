/** Label shown for a bus that is this many minutes away ("Arr" at one minute or less). */
export function formatMinutesAway(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 1) return 'Arr';
  return `${Math.floor(minutes)} min`;
}
