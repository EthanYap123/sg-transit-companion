import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sendError } from './errors.js';

export interface RateLimiterOptions {
  limit: number;
  windowMs?: number;
}

/**
 * Per-client request limit, counted in this process's memory. The API runs as one instance on Render
 * Free, so this costs no Redis commands; running several instances would mean a shared store instead
 * (docs/ARCHITECTURE.md, section 6). Clients are told their allowance through RateLimit-* headers.
 */
export function rateLimiter({ limit, windowMs = 60_000 }: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: (_req, res) =>
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'),
  });
}
