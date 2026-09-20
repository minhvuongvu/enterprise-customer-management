import type { AppError } from '../../core/errors/app-error';

/**
 * The state of something that has to be fetched.
 *
 * A discriminated union rather than `isLoading` / `isError` / `data` flags,
 * for a reason that shows up the first time a list is reloaded: booleans allow
 * states that cannot happen. `isLoading && isError`, or data present while
 * loading is true, are both representable - so every template ends up ordering
 * its `@if`s carefully and silently depending on that order.
 *
 * Five states, and the fifth is the one usually missing:
 *
 *  - `idle`       nothing has been asked for yet;
 *  - `loading`    a first request is in flight and there is nothing to show;
 *  - `refreshing` a request is in flight and **a value for that same request
 *                 is already here**. This is what lets a reload keep the table
 *                 on screen instead of replacing it with a skeleton, which is
 *                 the difference between a list that feels instant and one
 *                 that flickers every time it is revisited;
 *  - `success`    a value;
 *  - `error`      a failure, optionally still carrying the last good value, so
 *                 a failed refresh can show the stale rows *and* say that the
 *                 refresh failed.
 *
 * "Empty" is deliberately **not** a state. A list with no rows is a successful
 * answer to a question, not a different kind of outcome, and making it a state
 * would force every consumer to remember two success cases. It is derived -
 * `success` with zero items - and rendered explicitly by each surface that has
 * something meaningful to say about it.
 *
 * It lives in the customer feature because that is the only feature there is.
 * When a second one needs it, this file moves to `core/state`; moving it then
 * is a rename, and naming a shared location before there is a second caller is
 * what rule 8 in CLAUDE.md forbids.
 */
export type RemoteData<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'refreshing'; readonly value: T }
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'error'; readonly error: AppError; readonly value: T | null };

export const idle = { status: 'idle' } as const;
export const loading = { status: 'loading' } as const;

export function success<T>(value: T): RemoteData<T> {
  return { status: 'success', value };
}

export function failed<T>(error: AppError, previous: T | null = null): RemoteData<T> {
  return { status: 'error', error, value: previous };
}

/**
 * Enters the in-flight state for a request whose cached answer is `cached`.
 *
 * The single place that decides "is this a load or a refresh", so no call site
 * has to. It takes the cached value for *this* request rather than whatever
 * was on screen a moment ago, which is what keeps `refreshing` meaning
 * something precise: you are looking at the answer to this question, and it is
 * being checked again. Showing the previous page's rows while a different page
 * loads would technically be a refresh and would read as a bug.
 */
export function reloadFrom<T>(cached: T | null): RemoteData<T> {
  return cached === null ? loading : { status: 'refreshing', value: cached };
}

/** The value, if this state has one. */
export function valueOf<T>(state: RemoteData<T>): T | null {
  switch (state.status) {
    case 'refreshing':
    case 'success':
      return state.value;
    case 'error':
      return state.value;
    default:
      return null;
  }
}

/** True while a request is in flight, whether or not there is a value. */
export function isPending<T>(state: RemoteData<T>): boolean {
  return state.status === 'loading' || state.status === 'refreshing';
}
