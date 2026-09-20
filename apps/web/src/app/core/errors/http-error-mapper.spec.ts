import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { mapHttpError } from './http-error-mapper';

function responseWith(status: number, headers?: HttpHeaders): HttpErrorResponse {
  return new HttpErrorResponse({ status, headers, url: '/api/customers' });
}

/** A response carrying the published error envelope as its body. */
function responseWithBody(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error, url: '/api/customers' });
}

describe('mapHttpError', () => {
  it.each([
    [400, 'validation'],
    [422, 'validation'],
    [401, 'authentication'],
    [403, 'authorization'],
    [404, 'not-found'],
    [409, 'conflict'],
    [429, 'rate-limited'],
    [500, 'server'],
    [503, 'server'],
  ])('maps status %i to kind %s', (status, kind) => {
    expect(mapHttpError(responseWith(status)).kind).toBe(kind);
  });

  it('treats a status of 0 as a network failure, not a server error', () => {
    // Angular reports 0 when there was no HTTP response at all: offline,
    // connection refused, or a CORS rejection.
    expect(mapHttpError(responseWith(0)).kind).toBe('network');
  });

  it('carries the correlation id so a log line can be found later', () => {
    expect(mapHttpError(responseWith(500), 'cid-123').correlationId).toBe('cid-123');
  });

  it('uses a translation key, never a backend message', () => {
    const mapped = mapHttpError(responseWith(409));

    expect(mapped.messageKey).toBe('errors.conflict');
    expect(mapped.messageKey).not.toContain(' ');
  });

  it('carries the current version a stale write collided with', () => {
    const mapped = mapHttpError(
      responseWithBody(409, {
        error: {
          code: 'CONFLICT',
          message: 'Modified by someone else',
          correlationId: 'test',
          details: { currentVersion: 7 },
        },
      }),
    );

    // The discriminator between the two things 409 means on this API: with a
    // version it is a stale write, without one it is a duplicate record.
    expect(mapped.kind).toBe('conflict');
    expect(mapped.kind === 'conflict' && mapped.currentVersion).toBe(7);
  });

  it('leaves the version undefined when the conflict is not about one', () => {
    const mapped = mapHttpError(
      responseWithBody(409, {
        error: { code: 'CONFLICT', message: 'Email exists', correlationId: 'test' },
      }),
    );

    expect(mapped.kind === 'conflict' && mapped.currentVersion).toBeUndefined();
  });

  it('reads Retry-After when the server rate limits', () => {
    const mapped = mapHttpError(responseWith(429, new HttpHeaders({ 'Retry-After': '30' })));

    expect(mapped.kind).toBe('rate-limited');
    expect(mapped.kind === 'rate-limited' && mapped.retryAfterSeconds).toBe(30);
  });

  it('ignores a Retry-After it cannot understand', () => {
    const mapped = mapHttpError(
      responseWith(429, new HttpHeaders({ 'Retry-After': 'Wed, 21 Oct' })),
    );

    expect(mapped.kind === 'rate-limited' && mapped.retryAfterSeconds).toBeUndefined();
  });

  it('classifies an unexpected 4xx as unknown rather than guessing', () => {
    expect(mapHttpError(responseWith(418)).kind).toBe('unknown');
  });
});
