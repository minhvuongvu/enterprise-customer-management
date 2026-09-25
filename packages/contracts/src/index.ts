/**
 * @ecm/contracts - the single definition of the API shape.
 *
 * Consumed by `apps/web` and `apps/mock-api`. It must never import from either:
 * the whole point is that both sides depend on this, and this depends on
 * nothing of theirs.
 *
 * Every schema here is both a runtime validator and the source of its
 * TypeScript type. There is no second, hand-written copy of any of these types
 * anywhere in the repository - if one appears, the two will disagree, and the
 * one that is wrong will be the one nobody is looking at.
 */

export * from './primitives.js';
export * from './errors.js';
export * from './health.js';
export * from './pagination.js';
export * from './auth.js';
export * from './customer.js';
export * from './audit.js';
export * from './operations.js';
export * from './file-policy.js';
export * from './realtime.js';
export * from './fixtures.js';
