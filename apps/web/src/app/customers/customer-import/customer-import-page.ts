import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  checkFile,
  IMPORT_ALLOWED_EXTENSIONS,
  IMPORT_ALLOWED_MIME_TYPES,
  IMPORT_FILE_POLICY,
  IMPORT_REQUIRED_COLUMNS,
  type ImportPreview,
  type ImportResult,
  type ImportRowError,
} from '@ecm/contracts';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Observable, Subscription } from 'rxjs';
import { messageKeyOf } from '../../core/errors/app-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { fractionOf, type Transfer } from '../data/transfer';
import { FileDrop } from '../files/file-drop';
import { fileRejectionKey, fileRejectionParams } from '../files/file-rejection';
import { FileSaver } from '../files/file-saver';
import { CustomerStore } from '../state/customer-store';
import { importErrorReport } from './import-error-report';

/**
 * Importing customers from a CSV file.
 *
 *     select ─▶ validate file ─▶ upload + parse ─▶ preview + validate rows
 *                                                        │ confirm
 *                                                        ▼
 *                                   result ◀─ import ◀─ upload
 *
 * ## Two requests, one file
 *
 * The preview is the server's answer to "what would this file do?" -
 * `POST /customers/import?mode=preview` parses and validates every row,
 * including against customers that already exist, and writes nothing. The
 * user sees what will be imported and what will not, and confirms. The import
 * then sends the same file again. Nothing is held on the server between the
 * two, so a preview the user walks away from costs nothing. ADR-0024.
 *
 * ## Partial success is a result, not an error
 *
 * A file with 4,900 good rows and 100 bad ones imports 4,900. The result says
 * so, lists the failed rows by the row number the user's spreadsheet shows,
 * and offers them as a downloadable CSV to fix and re-import.
 *
 * ## What the user is never shown
 *
 * The server's per-row `message` is developer prose. Each failure is shown by
 * its code and column, through the translation layer.
 *
 * Uploads report progress and can be cancelled; the page is never blocked.
 */

type Step =
  | { readonly name: 'select'; readonly rejection: { key: string; params: object } | null }
  | { readonly name: 'previewing'; readonly file: File; readonly percent: number | null }
  | { readonly name: 'preview'; readonly file: File; readonly preview: ImportPreview }
  | {
      readonly name: 'importing';
      readonly file: File;
      readonly preview: ImportPreview;
      readonly percent: number | null;
    }
  | { readonly name: 'result'; readonly result: ImportResult }
  | {
      readonly name: 'failed';
      readonly file: File;
      readonly errorKey: string;
      /** What the retry repeats. */
      readonly during: 'preview' | 'import';
      readonly preview: ImportPreview | null;
    };

@Component({
  selector: 'app-customer-import-page',
  imports: [
    Badge,
    Button,
    FileDrop,
    NgTemplateOutlet,
    PageContainer,
    PageHeader,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.import.heading')"
        [description]="t('pages.customers.import.description')"
      >
        <div pageActions>
          <app-button variant="ghost" link="/customers">
            {{ t('pages.customers.import.backToList') }}
          </app-button>
        </div>
      </app-page-header>

      <ol class="steps" [attr.aria-label]="t('pages.customers.import.stepsLabel')">
        @for (label of stepLabels; track label; let index = $index) {
          <li
            [class.steps__current]="index === stepIndex()"
            [attr.aria-current]="index === stepIndex() ? 'step' : null"
          >
            {{ t(label) }}
          </li>
        }
      </ol>

      @switch (step().name) {
        @case ('select') {
          <app-file-drop
            [label]="t('pages.customers.import.choose')"
            [hint]="
              t('pages.customers.import.hint', {
                columns: requiredColumns,
                size: maxSizeMb,
              })
            "
            [accept]="accept"
            (fileSelected)="choose($event)"
          />
          @if (rejection(); as rejected) {
            <p class="error" role="alert" data-testid="import-invalid-file">
              {{ t(rejected.key, rejected.params) }}
            </p>
          }
        }

        @case ('previewing') {
          <ng-container
            *ngTemplateOutlet="progress; context: { labelKey: 'pages.customers.import.checking' }"
          />
        }

        @case ('importing') {
          <ng-container
            *ngTemplateOutlet="progress; context: { labelKey: 'pages.customers.import.importing' }"
          />
        }

        @case ('preview') {
          @if (preview(); as p) {
            <section class="panel" data-testid="import-preview">
              <h2>{{ t('pages.customers.import.previewHeading') }}</h2>
              <p data-testid="preview-summary">
                {{
                  t('pages.customers.import.previewSummary', {
                    total: p.totalRows,
                    valid: p.validRows,
                    invalid: p.invalidRows,
                  })
                }}
              </p>

              @if (p.missingColumns.length) {
                <p class="error" role="alert" data-testid="missing-columns">
                  {{
                    t('pages.customers.import.missingColumns', {
                      columns: p.missingColumns.join(', '),
                    })
                  }}
                </p>
              }
              @if (p.unknownColumns.length) {
                <p class="note">
                  {{
                    t('pages.customers.import.unknownColumns', {
                      columns: p.unknownColumns.join(', '),
                    })
                  }}
                </p>
              }

              <div class="scroll">
                <table>
                  <caption class="visually-hidden">
                    {{
                      t('pages.customers.import.previewCaption', { count: p.rows.length })
                    }}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{{ t('pages.customers.import.row') }}</th>
                      <th scope="col">{{ t('customers.field.fullName') }}</th>
                      <th scope="col">{{ t('customers.field.email') }}</th>
                      <th scope="col">{{ t('customers.field.status') }}</th>
                      <th scope="col">{{ t('pages.customers.import.outcome') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of p.rows; track row.row) {
                      <tr>
                        <td>{{ row.row }}</td>
                        <td>{{ row.fullName }}</td>
                        <td>{{ row.email }}</td>
                        <td>{{ row.status }}</td>
                        <td>
                          <app-badge [tone]="row.valid ? 'success' : 'danger'">
                            {{
                              row.valid
                                ? t('pages.customers.import.willImport')
                                : t('pages.customers.import.willSkip')
                            }}
                          </app-badge>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              @if (p.errors.length) {
                <ng-container *ngTemplateOutlet="errorList; context: { errors: p.errors }" />
              }

              <div class="actions">
                <app-button
                  variant="primary"
                  [disabled]="!canImport()"
                  (click)="confirmImport()"
                  data-testid="confirm-import"
                >
                  {{ t('pages.customers.import.confirm', { count: p.validRows }) }}
                </app-button>
                <app-button (click)="restart()">
                  {{ t('pages.customers.import.chooseAnother') }}
                </app-button>
              </div>
            </section>
          }
        }

        @case ('result') {
          @if (result(); as r) {
            <section class="panel" role="status" data-testid="import-result">
              <h2>{{ t('pages.customers.import.resultHeading') }}</h2>
              <p data-testid="result-summary">
                {{
                  t('pages.customers.import.resultSummary', {
                    succeeded: r.succeeded,
                    failed: r.failed,
                  })
                }}
              </p>
              @if (r.errors.length) {
                <ng-container *ngTemplateOutlet="errorList; context: { errors: r.errors }" />
                @if (r.errorsTruncated) {
                  <p class="note">{{ t('pages.customers.import.truncated') }}</p>
                }
              }
              <div class="actions">
                @if (r.errors.length) {
                  <app-button (click)="downloadErrors(r.errors)" data-testid="download-errors">
                    {{ t('pages.customers.import.downloadErrors') }}
                  </app-button>
                }
                <app-button variant="primary" link="/customers">
                  {{ t('pages.customers.import.backToList') }}
                </app-button>
                <app-button (click)="restart()">
                  {{ t('pages.customers.import.chooseAnother') }}
                </app-button>
              </div>
            </section>
          }
        }

        @case ('failed') {
          @if (failure(); as f) {
            <section class="panel" role="alert" data-testid="import-failed">
              <p class="error">{{ t('pages.customers.import.failed') }} {{ t(f.errorKey) }}</p>
              <div class="actions">
                <app-button variant="primary" (click)="retry()" data-testid="import-retry">
                  {{ t('common.retry') }}
                </app-button>
                <app-button (click)="restart()">
                  {{ t('pages.customers.import.chooseAnother') }}
                </app-button>
              </div>
            </section>
          }
        }
      }

      <ng-template #progress let-labelKey="labelKey">
        <section class="panel" data-testid="import-progress">
          <p role="status">
            {{
              percent() === null
                ? t(labelKey)
                : t('pages.customers.import.percent', { label: t(labelKey), percent: percent() })
            }}
          </p>
          <progress [attr.value]="percent()" max="100" [attr.aria-label]="t(labelKey)"></progress>
          <div class="actions">
            <app-button (click)="cancel()" data-testid="import-cancel">
              {{ t('common.cancel') }}
            </app-button>
          </div>
        </section>
      </ng-template>

      <ng-template #errorList let-errors="errors">
        <h3>{{ t('pages.customers.import.errorsHeading') }}</h3>
        <ul class="errors" data-testid="import-errors">
          @for (error of asErrors(errors); track $index) {
            <li>
              {{
                t('pages.customers.import.errorLine', {
                  row: error.row,
                  column: error.column ?? t('pages.customers.import.wholeRow'),
                  reason: t('pages.customers.import.code.' + error.code),
                })
              }}
            </li>
          }
        </ul>
      </ng-template>
    </app-page-container>
  `,
  styles: `
    .steps {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0 0 var(--space-4);
      padding: 0;
      list-style: none;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      counter-reset: step;
    }

    .steps li {
      counter-increment: step;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-md);
    }

    .steps li::before {
      content: counter(step) '. ';
    }

    .steps__current {
      background-color: var(--accent-subtle);
      color: var(--accent-text);
      font-weight: var(--weight-semibold);
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .panel h2,
    .panel h3,
    .panel p {
      margin: 0;
    }

    .scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    th,
    td {
      padding: var(--space-2);
      border-bottom: var(--border-width) solid var(--border-subtle);
      text-align: start;
    }

    .errors {
      max-height: 16rem;
      margin: 0;
      overflow-y: auto;
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .error {
      color: var(--danger-text);
    }

    .note {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    progress {
      width: 100%;
    }
  `,
})
export class CustomerImportPage {
  private readonly store = inject(CustomerStore);
  private readonly files = inject(FileSaver);
  private readonly notifications = inject(NotificationService);

  protected readonly step = signal<Step>({ name: 'select', rejection: null });
  private transfer: Subscription | null = null;

  protected readonly accept = [...IMPORT_ALLOWED_EXTENSIONS, ...IMPORT_ALLOWED_MIME_TYPES].join(
    ',',
  );
  protected readonly requiredColumns = IMPORT_REQUIRED_COLUMNS.join(', ');
  protected readonly maxSizeMb = IMPORT_FILE_POLICY.maxBytes / (1024 * 1024);
  protected readonly stepLabels = [
    'pages.customers.import.step.select',
    'pages.customers.import.step.preview',
    'pages.customers.import.step.result',
  ];

  protected readonly stepIndex = computed(() => {
    switch (this.step().name) {
      case 'select':
      case 'previewing':
        return 0;
      case 'preview':
      case 'importing':
        return 1;
      case 'failed':
        return this.failure()?.during === 'import' ? 1 : 0;
      case 'result':
        return 2;
    }
  });

  protected readonly rejection = computed(() => {
    const step = this.step();
    return step.name === 'select' ? step.rejection : null;
  });
  protected readonly preview = computed(() => {
    const step = this.step();
    return step.name === 'preview' ? step.preview : null;
  });
  protected readonly result = computed(() => {
    const step = this.step();
    return step.name === 'result' ? step.result : null;
  });
  protected readonly failure = computed(() => {
    const step = this.step();
    return step.name === 'failed' ? step : null;
  });
  protected readonly percent = computed(() => {
    const step = this.step();
    return step.name === 'previewing' || step.name === 'importing' ? step.percent : null;
  });
  protected readonly canImport = computed(() => {
    const preview = this.preview();
    return preview !== null && preview.validRows > 0 && preview.missingColumns.length === 0;
  });

  constructor() {
    // Leaving the page aborts whatever is uploading.
    inject(DestroyRef).onDestroy(() => this.transfer?.unsubscribe());
  }

  /** Step 1: the file itself, checked by the rule the server also applies. */
  protected choose(file: File): void {
    const rejection = checkFile(file, IMPORT_FILE_POLICY);
    if (rejection) {
      this.step.set({
        name: 'select',
        rejection: {
          key: fileRejectionKey(rejection),
          params: fileRejectionParams(IMPORT_FILE_POLICY),
        },
      });
      return;
    }
    this.runPreview(file);
  }

  /** Step 3: the user has seen the preview and wants the valid rows imported. */
  protected confirmImport(): void {
    const step = this.step();
    if (step.name !== 'preview' || !this.canImport()) {
      return;
    }
    this.runImport(step.file, step.preview);
  }

  protected retry(): void {
    const failure = this.failure();
    if (!failure) {
      return;
    }
    if (failure.during === 'import' && failure.preview) {
      this.runImport(failure.file, failure.preview);
    } else {
      this.runPreview(failure.file);
    }
  }

  /** Aborts the upload in flight and goes back one step. Nothing was imported. */
  protected cancel(): void {
    this.transfer?.unsubscribe();
    this.transfer = null;
    const step = this.step();
    this.step.set(
      step.name === 'importing'
        ? { name: 'preview', file: step.file, preview: step.preview }
        : { name: 'select', rejection: null },
    );
  }

  protected restart(): void {
    this.transfer?.unsubscribe();
    this.transfer = null;
    this.step.set({ name: 'select', rejection: null });
  }

  protected downloadErrors(errors: readonly ImportRowError[]): void {
    this.files.save(importErrorReport(errors), 'import-errors.csv');
  }

  /** Narrows the template's untyped context variable. */
  protected asErrors(errors: unknown): readonly ImportRowError[] {
    return errors as readonly ImportRowError[];
  }

  private runPreview(file: File): void {
    this.step.set({ name: 'previewing', file, percent: 0 });
    this.follow(
      this.store.previewImport(file),
      (percent) => this.step.set({ name: 'previewing', file, percent }),
      (preview) => this.step.set({ name: 'preview', file, preview }),
      (errorKey) =>
        this.step.set({ name: 'failed', file, errorKey, during: 'preview', preview: null }),
    );
  }

  private runImport(file: File, preview: ImportPreview): void {
    this.step.set({ name: 'importing', file, preview, percent: 0 });
    this.follow(
      this.store.importFile(file),
      (percent) => this.step.set({ name: 'importing', file, preview, percent }),
      (result) => {
        this.step.set({ name: 'result', result });
        this.notifications.record('pages.customers.import.notification', {
          tone: result.failed ? 'warning' : 'success',
          params: { succeeded: result.succeeded, failed: result.failed },
          link: ['/customers'],
        });
      },
      (errorKey) => this.step.set({ name: 'failed', file, errorKey, during: 'import', preview }),
    );
  }

  private follow<T>(
    transfer: Observable<Transfer<T>>,
    progress: (percent: number | null) => void,
    done: (value: T) => void,
    failed: (errorKey: string) => void,
  ): void {
    this.transfer?.unsubscribe();
    this.transfer = transfer.subscribe({
      next: (event) => {
        if (event.kind === 'done') {
          this.transfer = null;
          done(event.value);
          return;
        }
        const fraction = fractionOf(event);
        // Once every byte is sent the server is still parsing; say so rather
        // than sitting at 100 % looking finished.
        progress(fraction === null || fraction >= 1 ? null : Math.round(fraction * 100));
      },
      error: (error: unknown) => {
        this.transfer = null;
        failed(messageKeyOf(error));
      },
    });
  }
}
