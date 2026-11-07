import type { RequestHandler, Response } from 'express';
import { sendError } from '../http/errors.js';
import { verifyApiToken, type ApiIdentity } from './api-token.js';

/** Bearer API token check. With no secret configured, user routes are closed. */
export function requireUser(secret: string): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const identity = token ? await verifyApiToken(token, secret) : null;
    if (!identity) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Missing, invalid or expired token');
      return;
    }
    res.locals.identity = identity;
    next();
  };
}

/** The caller's identity, on routes behind requireUser. */
export function identityOf(res: Response): ApiIdentity {
  return res.locals.identity as ApiIdentity;
}
