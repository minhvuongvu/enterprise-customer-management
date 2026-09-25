import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ImportPreview, ImportResult } from '@ecm/contracts';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { FileDrop } from '../files/file-drop';
import { FileSaver } from '../files/file-saver';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { CustomerImportPage } from './customer-import-page';

const csv = new File(['fullName,email\n'], 'people.csv', { type: 'text/csv' });

const PREVIEW: ImportPreview = {
  totalRows: 3,
  validRows: 2,
  invalidRows: 1,
  missingColumns: [],
  unknownColumns: ['nickname'],
  rows: [
    { row: 2, fullName: 'Good One', email: 'good1@example.test', status: 'ACTIVE', valid: true },
    { row: 3, fullName: 'Bad', email: 'nope', status: 'ACTIVE', valid: false },
    { row: 4, fullName: 'Good Two', email: 'good2@example.test', status: '', valid: true },
  ],
  errors: [{ row: 3, column: 'email', code: 'INVALID_FORMAT', message: 'Developer prose' }],
  errorsTruncated: false,
};

const RESULT: ImportResult = {
  totalRows: 3,
  succeeded: 2,
  failed: 1,
  errors: [{ row: 3, column: 'email', code: 'INVALID_FORMAT', message: 'Developer prose' }],
  errorsTruncated: false,
  completedAt: '2026-09-25T10:00:00.000Z' as ImportResult['completedAt'],
};

describe('CustomerImportPage', () => {
  let fixture: ComponentFixture<CustomerImportPage>;
  let backend: HttpTestingController;
  let saved: { blob: Blob; name: string }[];

  beforeEach(async () => {
    saved = [];
    await TestBed.configureTestingModule({
      imports: [CustomerImportPage, provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs('manager'),
        provideRouter([]),
        CustomerCache,
        CustomerStore,
        {
          provide: FileSaver,
          useValue: { save: (blob: Blob, name: string) => saved.push({ blob, name }) },
        },
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CustomerImportPage);
    fixture.detectChanges();
  });

  afterEach(() => backend.verify());

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(testId: string): string {
    return root().querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
  }

  function choose(file: File): void {
    fixture.debugElement.query(By.directive(FileDrop)).componentInstance.fileSelected.emit(file);
    fixture.detectChanges();
  }

  function click(testId: string): void {
    root().querySelector<HTMLElement>(`[data-testid="${testId}"] button`)?.click();
    fixture.detectChanges();
  }

  function importRequest(mode: 'preview' | 'commit'): TestRequest {
    const request = backend.expectOne((candidate) => candidate.url === '/api/customers/import');
    expect(request.request.params.get('mode')).toBe(mode);
    return request;
  }

  it('refuses a file that is not a CSV before uploading anything', () => {
    choose(new File(['{}'], 'people.json', { type: 'application/json' }));
    expect(text('import-invalid-file')).toContain('That kind of file is not accepted');
  });

  it('previews what the file will do, row by row, before anything is imported', () => {
    choose(csv);
    importRequest('preview').flush(PREVIEW);
    fixture.detectChanges();

    expect(text('preview-summary')).toContain('3 rows: 2 will be imported, 1 will be skipped.');
    expect(text('import-preview')).toContain('These columns will be ignored: nickname.');
    // Each failure by its code, translated - never the server's own words.
    expect(text('import-errors')).toContain('Row 3, email: the value is not in a valid format');
    expect(text('import-errors')).not.toContain('Developer prose');
  });

  it('cannot import a file that lacks a required column', () => {
    choose(csv);
    importRequest('preview').flush({ ...PREVIEW, missingColumns: ['email'] });
    fixture.detectChanges();

    expect(text('missing-columns')).toContain('no email column');
    expect(
      root().querySelector<HTMLButtonElement>('[data-testid="confirm-import"] button')?.disabled,
    ).toBe(true);
  });

  it('imports on confirmation and reports a partial success, with the skipped rows downloadable', async () => {
    choose(csv);
    importRequest('preview').flush(PREVIEW);
    fixture.detectChanges();

    click('confirm-import');
    importRequest('commit').flush(RESULT);
    fixture.detectChanges();

    expect(text('result-summary')).toContain('2 customers imported, 1 rows skipped.');

    click('download-errors');
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('import-errors.csv');
    const report = await saved[0].blob.text();
    expect(report.split('\r\n')[1]).toBe('"3","email","INVALID_FORMAT"');
  });

  it('cancels an upload by aborting it, and goes back one step', () => {
    choose(csv);
    importRequest('preview').flush(PREVIEW);
    fixture.detectChanges();

    click('confirm-import');
    const commit = importRequest('commit');
    click('import-cancel');

    expect(commit.cancelled).toBe(true);
    // Back at the preview: nothing was imported, and the user can try again.
    expect(root().querySelector('[data-testid="import-preview"]')).not.toBeNull();
  });

  it('offers a retry when the upload fails', () => {
    choose(csv);
    importRequest('preview').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(text('import-failed')).toContain('The file could not be processed.');
    click('import-retry');
    importRequest('preview').flush(PREVIEW);
  });
});
