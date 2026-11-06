import { Router } from 'express';
import { z } from 'zod';
import { ArrivalsUnavailableError, type ArrivalsService } from '../arrivals/arrivals-service.js';
import { sendError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { stopCodeSchema } from '../stops/stop.js';
import type { StopIndex } from '../stops/stop-index.js';

const searchQuery = z.object({
  q: z.string().trim().min(2, 'must be at least 2 characters').max(50, 'must be at most 50 characters'),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

const arrivalsQuery = z.object({
  service: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{1,5}$/, 'must be a bus service number such as 15 or 185A')
    .optional(),
});

/** Public stop endpoints from docs/API.md. Search and stop details work even when LTA is down. */
export function stopsRouter(deps: { index: StopIndex; arrivals: ArrivalsService }): Router {
  const router = Router();

  router.get('/search', (req, res) => {
    const query = validate(res, searchQuery, req.query);
    if (!query) return;
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ query: query.q, results: deps.index.search(query.q, query.limit) });
  });

  router.get('/:code', (req, res) => {
    const code = validate(res, stopCodeSchema, req.params.code, 'code');
    if (!code) return;
    const stop = deps.index.get(code);
    if (!stop) return sendError(res, 404, 'NOT_FOUND', `No bus stop with code ${code}`);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(stop);
  });

  router.get('/:code/arrivals', async (req, res) => {
    const code = validate(res, stopCodeSchema, req.params.code, 'code');
    if (!code) return;
    const query = validate(res, arrivalsQuery, req.query);
    if (!query) return;

    // While the stop list is still loading at boot, let the request through rather than wrongly 404.
    if (deps.index.size > 0 && !deps.index.get(code)) {
      return sendError(res, 404, 'NOT_FOUND', `No bus stop with code ${code}`);
    }

    try {
      const result = await deps.arrivals.getArrivals(code);
      const service = query.service?.toLowerCase();
      res.set('Cache-Control', 'public, max-age=10');
      res.json(
        service
          ? { ...result, services: result.services.filter((s) => s.serviceNo.toLowerCase() === service) }
          : result,
      );
    } catch (err) {
      if (!(err instanceof ArrivalsUnavailableError)) throw err;
      res.set('Retry-After', '30');
      sendError(res, 503, 'LTA_UNAVAILABLE', 'Live arrivals are temporarily unavailable. Try again shortly.');
    }
  });

  return router;
}
