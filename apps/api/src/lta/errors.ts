export type LtaErrorKind =
  'not_configured' | 'circuit_open' | 'timeout' | 'network' | 'rate_limited' | 'http' | 'invalid_response';

/** Every failure talking to LTA ends up as one of these, so callers can fall back to stale data. */
export class LtaError extends Error {
  readonly kind: LtaErrorKind;
  readonly status: number | undefined;

  constructor(kind: LtaErrorKind, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'LtaError';
    this.kind = kind;
    this.status = options.status;
  }

  /** Network errors, timeouts and 5xx are worth one more try; 4xx and bad data are not. */
  get retryable(): boolean {
    return (
      this.kind === 'timeout' ||
      this.kind === 'network' ||
      (this.kind === 'http' && this.status !== undefined && this.status >= 500)
    );
  }
}
