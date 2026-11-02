import cors from 'cors';
import type { RequestHandler } from 'express';

/** Splits CORS_ORIGINS ("https://a.example, https://b.example") into a clean list. */
export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Lets the listed web origins call the public API from the browser. Other origins get no CORS
 * headers, so browsers block them. Internal routes are never mounted behind this.
 */
export function corsForOrigins(origins: string[]): RequestHandler {
  const allowed = new Set(origins);
  return cors({
    origin: (origin, callback) => callback(null, origin !== undefined && allowed.has(origin)),
    methods: ['GET'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}
