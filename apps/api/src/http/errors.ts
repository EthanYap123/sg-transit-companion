import type { Response } from 'express';
import type { z } from 'zod';

/** Error codes from docs/API.md. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'LTA_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

export interface ErrorDetail {
  path: string;
  issue: string;
}

/** Sends the one error shape every endpoint uses, including the request id for support. */
export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): void {
  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: String(res.locals.requestId ?? ''),
    },
  });
}

/** `field` names a value validated on its own, such as a path parameter. */
export function sendValidationError(res: Response, error: z.ZodError, field?: string): void {
  const pathOf = (issue: z.core.$ZodIssue) =>
    [...(field ? [field] : []), ...issue.path.map(String)].join('.') || 'request';
  const details = error.issues.map((issue) => ({ path: pathOf(issue), issue: issue.code }));
  const [first] = error.issues;
  const message = first ? `${pathOf(first)}: ${first.message}` : 'Invalid request';
  sendError(res, 400, 'VALIDATION_FAILED', message, details);
}
