import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { sendError } from './errors.js';

export interface RateLimiterOptions {
  limit: number;
  windowMs?: number;
  /** Who to count. Defaults to the client address. */
  keyBy?: (req: Request, res: Response) => string;
  /** Count only requests that fail, for limits meant to slow down guessing. */
  countFailedOnly?: boolean;
}

/**
 * Per-client request limit, counted in this process's memory. The API runs as one instance on Render
 * Free, so this costs no Redis commands; running several instances would mean a shared store instead
 * (docs/ARCHITECTURE.md, section 6). Clients are told their allowance through RateLimit-* headers.
 */
export function rateLimiter(options: RateLimiterOptions): RequestHandler {
  const { limit, windowMs = 60_000, keyBy, countFailedOnly = false } = options;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    skipSuccessfulRequests: countFailedOnly,
    keyGenerator: keyBy ?? ((req) => ipKeyGenerator(req.ip ?? '')),
    handler: (_req, res) =>
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'),
  });
}
