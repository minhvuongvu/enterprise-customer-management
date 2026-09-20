/**
 * A correlation ID ties one user action to every log line and every HTTP
 * request it caused, on the client and later in the mock API. It is the thing
 * that makes "it failed for this user at 14:02" answerable.
 *
 * `crypto` is deliberately not behind a platform token: unlike `window`, the
 * Web Crypto API exists in the browser and in Node, so this file is one of the
 * few places where reaching for a global is correct rather than a leak.
 */

/** A generated identifier, unique enough to correlate one request. */
export type CorrelationId = string;

export function newCorrelationId(): CorrelationId {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  // Non-secure contexts do not expose randomUUID. A correlation ID is not a
  // security token, so a weaker source is acceptable here - and only here.
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
