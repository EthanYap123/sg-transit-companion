export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** How long the circuit stays open before one trial request is let through. */
  openMs?: number;
  now?: () => number;
}

/**
 * Stops calling a failing dependency for a while, then lets a single request through to test it.
 * closed → (N failures) → open → (openMs passes) → half-open → success: closed / failure: open again.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;
  private failures = 0;
  private openUntil = 0;
  private trialInFlight = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openMs = options.openMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    if (this.openUntil === 0) return 'closed';
    return this.now() < this.openUntil ? 'open' : 'half-open';
  }

  /** True if a request may go out now. In half-open state only one trial request is allowed at a time. */
  tryAcquire(): boolean {
    const state = this.state;
    if (state === 'closed') return true;
    if (state === 'open' || this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.trialInFlight = false;
  }

  recordFailure(): void {
    this.trialInFlight = false;
    if (this.openUntil !== 0) {
      this.trip(this.openMs);
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.trip(this.openMs);
  }

  /** Opens the circuit immediately, e.g. when the dependency says it is rate limiting us. */
  trip(ms: number): void {
    this.openUntil = this.now() + ms;
    this.trialInFlight = false;
  }
}
