import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { identityOf } from '../auth/require-user.js';
import {
  DuplicateFavouriteError,
  FavouriteLimitError,
  FavouriteOrderError,
  UnknownStopError,
  type Favourite,
  type FavouriteRepository,
} from '../favourites/favourite-repository.js';
import { sendError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { stopCodeSchema } from '../stops/stop.js';
import type { StopIndex } from '../stops/stop-index.js';

/** PRD US-08. */
export const FAVOURITE_LIMIT = 20;

/** Trimmed; an empty label clears it, so the stop's own name shows instead. */
const labelSchema = z
  .string()
  .trim()
  .max(30, 'must be at most 30 characters')
  .transform((value) => value || null);

const addBody = z.object({ busStopCode: stopCodeSchema, label: labelSchema.nullish() });
const renameBody = z.object({ label: labelSchema.nullable() });
const orderBody = z.object({ ids: z.array(z.uuid()).max(FAVOURITE_LIMIT) });
const favouriteId = z.uuid('must be a favourite id');

export interface FavouritesRouterOptions {
  favourites: FavouriteRepository;
  index: StopIndex;
  reads: RequestHandler;
  writes: RequestHandler;
  /** Sends the standard 503 when the database fails. */
  unavailable: (res: Parameters<RequestHandler>[1], err: unknown, context: string) => void;
}

/** The signed-in user's saved stops (docs/API.md). Mounted behind requireUser. */
export function favouritesRouter(options: FavouritesRouterOptions): Router {
  const { favourites, index, reads, writes, unavailable } = options;
  const router = Router();

  /** Adds whether LTA still lists the stop, so the app can say when one has closed. */
  const present = (favourite: Favourite) => ({
    ...favourite,
    stop: { ...favourite.stop, inService: index.size === 0 || index.get(favourite.stop.code) !== undefined },
  });

  router.get('/', reads, async (_req, res) => {
    try {
      const list = await favourites.list(identityOf(res).authSubject);
      res.json({ favourites: list.map(present) });
    } catch (err) {
      unavailable(res, err, 'GET /v1/me/favourites');
    }
  });

  router.post('/', writes, async (req, res) => {
    const body = validate(res, addBody, req.body);
    if (!body) return;
    if (index.size > 0 && !index.get(body.busStopCode)) {
      return sendError(res, 404, 'NOT_FOUND', `No bus stop with code ${body.busStopCode}`);
    }
    try {
      const favourite = await favourites.add(
        identityOf(res),
        body.busStopCode,
        body.label ?? null,
        FAVOURITE_LIMIT,
      );
      res.status(201).json(present(favourite));
    } catch (err) {
      if (err instanceof DuplicateFavouriteError) return sendError(res, 409, 'CONFLICT', err.message);
      if (err instanceof FavouriteLimitError) {
        return sendError(res, 409, 'CONFLICT', err.message, [{ path: 'limit', issue: String(err.limit) }]);
      }
      if (err instanceof UnknownStopError) return sendError(res, 404, 'NOT_FOUND', err.message);
      unavailable(res, err, 'POST /v1/me/favourites');
    }
  });

  // Registered before /:id so "order" is never read as an id.
  router.put('/order', writes, async (req, res) => {
    const body = validate(res, orderBody, req.body);
    if (!body) return;
    try {
      const list = await favourites.reorder(identityOf(res).authSubject, body.ids);
      res.json({ favourites: list.map(present) });
    } catch (err) {
      if (err instanceof FavouriteOrderError) {
        return sendError(res, 400, 'VALIDATION_FAILED', err.message, [{ path: 'ids', issue: 'mismatch' }]);
      }
      unavailable(res, err, 'PUT /v1/me/favourites/order');
    }
  });

  router.patch('/:id', writes, async (req, res) => {
    const id = validate(res, favouriteId, req.params.id, 'id');
    if (!id) return;
    const body = validate(res, renameBody, req.body);
    if (!body) return;
    try {
      const favourite = await favourites.rename(identityOf(res).authSubject, id, body.label);
      if (!favourite) return sendError(res, 404, 'NOT_FOUND', 'No saved stop with this id');
      res.json(present(favourite));
    } catch (err) {
      unavailable(res, err, 'PATCH /v1/me/favourites/:id');
    }
  });

  router.delete('/:id', writes, async (req, res) => {
    const id = validate(res, favouriteId, req.params.id, 'id');
    if (!id) return;
    try {
      const removed = await favourites.remove(identityOf(res).authSubject, id);
      if (!removed) return sendError(res, 404, 'NOT_FOUND', 'No saved stop with this id');
      res.status(204).end();
    } catch (err) {
      unavailable(res, err, 'DELETE /v1/me/favourites/:id');
    }
  });

  return router;
}
