import { Router, type RequestHandler, type Response } from 'express';
import { identityOf, requireUser } from '../auth/require-user.js';
import { sendError } from '../http/errors.js';
import { rateLimiter } from '../http/rate-limit.js';
import type { UserRepository } from '../users/user-repository.js';

export interface MeRouterOptions {
  jwtSecret: string;
  users: UserRepository;
  readsPerMinute: number;
  writesPerMinute: number;
  /** Failed sign-in attempts per client address, so tokens cannot be guessed quickly. */
  failedAuthPerMinute: number;
  onError?: (err: unknown, context: string) => void;
}

/** The signed-in user's own account (docs/API.md). */
export function meRouter(options: MeRouterOptions): Router {
  const { users } = options;
  const onError = options.onError ?? (() => undefined);
  const router = Router();

  const perUser = (limit: number): RequestHandler =>
    rateLimiter({ limit, keyBy: (_req, res) => identityOf(res).authSubject });

  function databaseUnavailable(res: Response, err: unknown, context: string) {
    onError(err, context);
    sendError(
      res,
      503,
      'DEPENDENCY_UNAVAILABLE',
      'Your account is unavailable right now. Try again shortly.',
    );
  }

  router.use(rateLimiter({ limit: options.failedAuthPerMinute, countFailedOnly: true }));
  router.use(requireUser(options.jwtSecret));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', perUser(options.readsPerMinute), async (_req, res) => {
    try {
      const user = await users.upsert(identityOf(res));
      res.json(user);
    } catch (err) {
      databaseUnavailable(res, err, 'GET /v1/me');
    }
  });

  router.delete('/', perUser(options.writesPerMinute), async (_req, res) => {
    try {
      await users.deleteBySubject(identityOf(res).authSubject);
      res.status(204).end();
    } catch (err) {
      databaseUnavailable(res, err, 'DELETE /v1/me');
    }
  });

  return router;
}
