import type { Response } from 'express';
import type { z } from 'zod';
import { sendValidationError } from './errors.js';

/**
 * Checks a path parameter, query or body against a zod schema. Returns the parsed value, or sends the
 * standard 400 and returns undefined, so a route only has to stop when it gets undefined.
 * `field` names a value validated on its own, such as a path parameter.
 */
export function validate<Schema extends z.ZodType>(
  res: Response,
  schema: Schema,
  value: unknown,
  field?: string,
): z.output<Schema> | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  sendValidationError(res, parsed.error, field);
  return undefined;
}
