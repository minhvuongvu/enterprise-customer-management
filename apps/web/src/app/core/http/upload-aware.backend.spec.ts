import { FetchBackend, HttpRequest, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';
import { UploadAwareBackend } from './upload-aware.backend';

/**
 * Which transport a request travels on. `fetch` has no upload progress, and
 * Angular's FetchBackend throws if asked for it - so this routing is the
 * difference between a progress bar and a crash.
 */
describe('UploadAwareBackend', () => {
  let backend: UploadAwareBackend;
  let fetchHandled: HttpRequest<unknown>[];
  let xhrHandled: HttpRequest<unknown>[];

  beforeEach(() => {
    fetchHandled = [];
    xhrHandled = [];
    TestBed.configureTestingModule({
      providers: [
        UploadAwareBackend,
        {
          provide: FetchBackend,
          useValue: { handle: (r: HttpRequest<unknown>) => (fetchHandled.push(r), EMPTY) },
        },
        {
          provide: HttpXhrBackend,
          useValue: { handle: (r: HttpRequest<unknown>) => (xhrHandled.push(r), EMPTY) },
        },
      ],
    });
    backend = TestBed.inject(UploadAwareBackend);
  });

  it('sends an upload that wants progress through XHR', () => {
    backend.handle(
      new HttpRequest('POST', '/api/customers/1/avatar', new FormData(), {
        reportUploadProgress: true,
      }),
    );
    expect(xhrHandled).toHaveLength(1);
    expect(fetchHandled).toHaveLength(0);
  });

  it('sends everything else through fetch - including a download that wants progress', () => {
    backend.handle(new HttpRequest('GET', '/api/customers'));
    backend.handle(new HttpRequest('GET', '/api/customers/export', { reportProgress: true }));
    expect(fetchHandled).toHaveLength(2);
    expect(xhrHandled).toHaveLength(0);
  });
});
