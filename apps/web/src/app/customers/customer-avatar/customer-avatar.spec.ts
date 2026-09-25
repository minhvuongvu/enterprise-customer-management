import { HttpEventType } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AVATAR_MAX_BYTES } from '@ecm/contracts';
import { OBJECT_URLS } from '../../core/platform/platform.tokens';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { FileDrop } from '../files/file-drop';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer } from '../testing/customer.fixture';
import { CustomerAvatar } from './customer-avatar';

@Component({
  selector: 'app-avatar-host',
  imports: [CustomerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-customer-avatar [customer]="customer()" />',
})
class AvatarHost {
  readonly customer = signal(aCustomer());
}

/**
 * The avatar upload, through the real store and HTTP chain.
 *
 * Files are handed to the component the way `app-file-drop` hands them over -
 * its output - because jsdom cannot synthesise a real file drop.
 */
describe('CustomerAvatar', () => {
  let fixture: ComponentFixture<AvatarHost>;
  let backend: HttpTestingController;
  let revoked: string[];
  const customer = aCustomer();
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'portrait.png', {
    type: 'image/png',
  });

  beforeEach(async () => {
    revoked = [];
    await TestBed.configureTestingModule({
      imports: [AvatarHost, provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs('manager'),
        CustomerCache,
        CustomerStore,
        {
          provide: OBJECT_URLS,
          useValue: { create: () => 'blob:preview', revoke: (url: string) => revoked.push(url) },
        },
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AvatarHost);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function choose(file: File): void {
    fixture.debugElement.query(By.directive(FileDrop)).componentInstance.fileSelected.emit(file);
    fixture.detectChanges();
  }

  function click(testId: string): void {
    root().querySelector<HTMLElement>(`[data-testid="${testId}"] button`)?.click();
    fixture.detectChanges();
  }

  it('refuses a file the policy refuses, before anything is sent', () => {
    choose(new File(['<svg onload="alert(1)"/>'], 'x.svg', { type: 'image/svg+xml' }));

    expect(root().querySelector('[data-testid="avatar-invalid"]')?.textContent).toContain(
      'That kind of file is not accepted',
    );
    // `verify` proves no request was made.
  });

  it('refuses a file over the size limit, naming the limit', () => {
    choose(new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'huge.png', { type: 'image/png' }));

    expect(root().querySelector('[data-testid="avatar-invalid"]')?.textContent).toContain('2 MB');
  });

  it('previews the chosen file, uploads it with progress, and frees the preview', () => {
    choose(png);
    expect(root().querySelector('[data-testid="avatar-preview"]')?.getAttribute('src')).toBe(
      'blob:preview',
    );

    click('avatar-upload');
    const upload = backend.expectOne(`/api/customers/${customer.id}/avatar`);
    upload.event({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    fixture.detectChanges();
    expect(root().querySelector('[data-testid="avatar-progress"]')?.textContent).toContain('40%');

    upload.flush({
      customerId: customer.id,
      avatarUrl: `/api/customers/${customer.id}/avatar`,
      sizeBytes: 4,
      contentType: 'image/png',
    });
    fixture.detectChanges();

    expect(root().querySelector('[data-testid="avatar-progress"]')).toBeNull();
    expect(revoked).toEqual(['blob:preview']);
  });

  it('cancels by aborting the request, and keeps the file ready to try again', () => {
    choose(png);
    click('avatar-upload');
    const upload = backend.expectOne(`/api/customers/${customer.id}/avatar`);

    click('avatar-cancel');

    expect(upload.cancelled).toBe(true);
    expect(root().querySelector('[data-testid="avatar-upload"]')).not.toBeNull();
  });

  it('reports a failure without a server sentence, and retries on request', () => {
    choose(png);
    click('avatar-upload');
    backend.expectOne(`/api/customers/${customer.id}/avatar`).flush(
      {
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Raw server text', correlationId: 'c' },
      },
      { status: 415, statusText: 'Unsupported' },
    );
    fixture.detectChanges();

    const failure = root().querySelector('[data-testid="avatar-failed"]')?.textContent ?? '';
    expect(failure).toContain('The picture was not uploaded.');
    expect(failure).not.toContain('Raw server text');

    click('avatar-upload');
    backend.expectOne(`/api/customers/${customer.id}/avatar`).flush({
      customerId: customer.id,
      avatarUrl: `/api/customers/${customer.id}/avatar`,
      sizeBytes: 4,
      contentType: 'image/png',
    });
  });
});
