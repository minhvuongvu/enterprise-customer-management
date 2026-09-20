import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CORRELATION_ID_HEADER, correlationIdInterceptor } from './correlation-id.interceptor';
import { errorMappingInterceptor } from './error-mapping.interceptor';
import { isAppError } from '../errors/app-error';
import { Logger } from '../logging/logger';
import type { LogFields, LogLevel } from '../logging/logger';

interface RecordedLog {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields?: LogFields;
}

/**
 * Hand-written double: it records what was logged so a test can assert on it.
 * Smaller than mocking the console, and it states its own contract.
 */
class RecordingLogger extends Logger {
  readonly entries: RecordedLog[] = [];

  get errors(): RecordedLog[] {
    return this.entries.filter((entry) => entry.level === 'error');
  }

  debug(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'debug', message, fields });
  }

  info(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'info', message, fields });
  }

  warn(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'warn', message, fields });
  }

  error(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'error', message, fields });
  }
}

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let logger: RecordingLogger;

  beforeEach(() => {
    logger = new RecordingLogger();
    TestBed.configureTestingModule({
      providers: [
        { provide: Logger, useValue: logger },
        provideHttpClient(withInterceptors([correlationIdInterceptor, errorMappingInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('stamps every request with a correlation id', () => {
    http.get('/api/ping').subscribe();

    const request = backend.expectOne('/api/ping');
    expect(request.request.headers.get(CORRELATION_ID_HEADER)).toBeTruthy();
    request.flush({});
  });

  it('gives each request its own correlation id', () => {
    http.get('/api/one').subscribe();
    http.get('/api/two').subscribe();

    const first = backend.expectOne('/api/one');
    const second = backend.expectOne('/api/two');

    expect(first.request.headers.get(CORRELATION_ID_HEADER)).not.toBe(
      second.request.headers.get(CORRELATION_ID_HEADER),
    );

    first.flush({});
    second.flush({});
  });

  it('replaces the HttpErrorResponse with a classified application error', async () => {
    const failure = new Promise<unknown>((resolve) => {
      http.get('/api/customers/1').subscribe({ error: resolve });
    });

    backend.expectOne('/api/customers/1').flush('gone', { status: 404, statusText: 'Not Found' });

    const error = await failure;
    expect(isAppError(error)).toBe(true);
    expect(isAppError(error) && error.kind).toBe('not-found');
    // The backend's body must not be what a feature gets handed.
    expect(isAppError(error) && error.messageKey).toBe('errors.notFound');
  });

  it('logs the failure with the same correlation id it sent', async () => {
    const failure = new Promise<unknown>((resolve) => {
      http.get('/api/boom').subscribe({ error: resolve });
    });

    const request = backend.expectOne('/api/boom');
    const sentId = request.request.headers.get(CORRELATION_ID_HEADER);
    request.flush('nope', { status: 500, statusText: 'Server Error' });
    await failure;

    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0].fields?.['correlationId']).toBe(sentId);
    expect(logger.errors[0].fields?.['kind']).toBe('server');
  });
});
