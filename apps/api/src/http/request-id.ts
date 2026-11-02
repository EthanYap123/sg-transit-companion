import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request an id, returned as X-Request-Id and inside error bodies, so a user's report can
 * be matched to the logs. A well-formed id from the caller (e.g. a proxy) is kept.
 */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = id;
    res.set('X-Request-Id', id);
    next();
  };
}
