import { HttpContextToken } from '@angular/common/http';

/**
 * Marks a request whose 401 must **not** trigger a token refresh.
 *
 * Three calls carry it: signing in, signing out and the refresh itself. A 401
 * from any of them is the answer, not a symptom - and a refresh interceptor
 * that tried to "recover" a failed refresh by refreshing would call itself
 * until the stack ran out.
 *
 * A context flag rather than a list of URLs in the interceptor: the caller
 * states the intent where the request is made, and moving an endpoint does not
 * silently re-enable refresh on it.
 *
 * In its own file so that `SessionApi` (which sets it) and the refresh
 * interceptor (which reads it) share it without importing each other - the
 * interceptor depends on `SessionService`, which depends on `SessionApi`.
 */
export const SKIP_SESSION_REFRESH = new HttpContextToken<boolean>(() => false);
