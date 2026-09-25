/**
 * Where the application sends someone to sign in, and where it sends them back.
 *
 * ## Why the return URL is checked at all
 *
 * `/login?returnUrl=...` is a URL anyone can construct and send to a user. If
 * the value were followed blindly, `returnUrl=https://evil.test/login` would
 * make this application's own sign-in form forward a freshly signed-in user to
 * an attacker's look-alike page - an open redirect, and the classic phishing
 * amplifier.
 *
 * So only a path inside this application is accepted. Everything else falls
 * back to the default. The check is deliberately a small allowlist of shapes
 * rather than a list of bad ones: a blocklist is always one encoding short.
 */

export const SIGN_IN_PATH = '/login';
export const DEFAULT_AFTER_SIGN_IN = '/customers';

/** Query parameter that carries the intended destination to the sign-in page. */
export const RETURN_URL_PARAM = 'returnUrl';

/** Query parameter that says why the user was sent to sign in, if not by choice. */
export const SIGN_IN_REASON_PARAM = 'reason';

/**
 * The destination to use after signing in.
 *
 * Accepted: an absolute path in this application - `/customers/42?page=2`.
 * Refused, falling back to the default:
 *
 *  - anything with a scheme or host (`https://…`, `javascript:…`);
 *  - a protocol-relative URL (`//evil.test`), which looks like a path and is
 *    not one;
 *  - a backslash anywhere, because browsers normalise `/\evil.test` into
 *    `//evil.test`;
 *  - the sign-in page itself, which would loop.
 */
export function safeReturnUrl(candidate: string | null | undefined): string {
  if (!candidate) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  const refused =
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    // Control characters (tab, newline) are stripped by URL parsers, which
    // turns `/\t/evil.test` into `//evil.test`.
    hasControlCharacter(candidate) ||
    candidate === SIGN_IN_PATH ||
    candidate.startsWith(`${SIGN_IN_PATH}?`) ||
    candidate.startsWith(`${SIGN_IN_PATH}/`);
  return refused ? DEFAULT_AFTER_SIGN_IN : candidate;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}
