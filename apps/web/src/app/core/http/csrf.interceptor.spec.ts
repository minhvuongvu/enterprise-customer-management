import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@ecm/contracts';
import { provideTestHttp } from '../testing/http-testing';

/**
 * The client half of the mock API's double-submit CSRF defence.
 *
 * Worth testing rather than trusting, because every failure mode here is
 * silent: a missing header is a 403 that looks like a permissions problem, and
 * a header sent to the wrong host is a leaked token that nothing reports.
 */
describe('csrfInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestHttp()] });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);

    TestBed.inject(DOCUMENT).cookie = `${CSRF_COOKIE_NAME}=token-123`;
  });

  afterEach(() => {
    TestBed.inject(DOCUMENT).cookie = `${CSRF_COOKIE_NAME}=; max-age=0`;
    backend.verify();
  });

  it('echoes the cookie on a request that changes something', () => {
    http.post('/api/customers', {}).subscribe();

    const request = backend.expectOne('/api/customers');
    expect(request.request.headers.get(CSRF_HEADER_NAME)).toBe('token-123');
    request.flush({});
  });

  it('leaves a read alone', () => {
    http.get('/api/customers').subscribe();

    // A GET that needed protecting would be a design error in the API, not
    // something to patch in an interceptor.
    const request = backend.expectOne('/api/customers');
    expect(request.request.headers.has(CSRF_HEADER_NAME)).toBe(false);
    request.flush({});
  });

  it('never sends the token to another origin', () => {
    http.post('https://elsewhere.test/api/customers', {}).subscribe();

    // The token is a credential. Sending it to whatever host a misconfigured
    // base URL names would hand it to that host.
    const request = backend.expectOne('https://elsewhere.test/api/customers');
    expect(request.request.headers.has(CSRF_HEADER_NAME)).toBe(false);
    request.flush({});
  });

  it('treats a protocol-relative URL as another origin', () => {
    http.post('//elsewhere.test/api/customers', {}).subscribe();

    // It looks relative and is not. This is the case a leading-slash check
    // gets wrong.
    const request = backend.expectOne('//elsewhere.test/api/customers');
    expect(request.request.headers.has(CSRF_HEADER_NAME)).toBe(false);
    request.flush({});
  });

  it('sends the request anyway when there is no token', () => {
    TestBed.inject(DOCUMENT).cookie = `${CSRF_COOKIE_NAME}=; max-age=0`;

    http.post('/api/customers', {}).subscribe();

    // Failing locally would hide the real reason, which is that there is no
    // session. The server answers 403 and the error taxonomy maps it.
    const request = backend.expectOne('/api/customers');
    expect(request.request.headers.has(CSRF_HEADER_NAME)).toBe(false);
    request.flush({});
  });
});
