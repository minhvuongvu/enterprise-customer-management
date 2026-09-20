import type { Request } from 'express';
import { badRequest } from './api-error.ts';

/**
 * Reads a path parameter as a string.
 *
 * Express 5 types a path parameter as `string | string[]`, because a route can
 * declare a repeated segment. None of ours do, but the type is honest and
 * silencing it with a cast at each call site would mean writing the same
 * unchecked assumption eight times.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`Missing path parameter "${name}".`);
  }
  return value;
}
