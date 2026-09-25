import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AVATAR_ALLOWED_EXTENSIONS,
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_FILE_POLICY,
  checkFile,
  type Customer,
} from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Subscription } from 'rxjs';
import { IfPermitted } from '../../core/auth/if-permitted.directive';
import { messageKeyOf } from '../../core/errors/app-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { OBJECT_URLS } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';
import { fractionOf } from '../data/transfer';
import { FileDrop } from '../files/file-drop';
import { fileRejectionKey, fileRejectionParams } from '../files/file-rejection';
import { CustomerStore } from '../state/customer-store';

/**
 * A customer's picture, and replacing it.
 *
 * The upload is a small state machine, and every state is visible:
 *
 *     idle ──choose──▶ ready (preview) ──upload──▶ uploading (progress)
 *       ▲                ▲   │ invalid                 │  │ cancel ─▶ ready
 *       └─── done ◀──────┼───┴────────────────────────┘  └ fail ──▶ failed ─retry─▶ uploading
 *
 * ## It does not block the page
 *
 * The state is this component's own. The rest of the detail page - refresh,
 * edit, the audit link - stays usable while bytes are moving, and leaving the
 * page cancels the upload rather than orphaning it.
 *
 * ## Cancel means cancel
 *
 * Cancelling unsubscribes, which aborts the XMLHttpRequest the upload travels
 * on (ADR-0021). The bytes stop; it is not a progress bar being hidden while
 * the upload carries on underneath.
 *
 * ## Validation is twice
 *
 * The file is checked here with the same `checkFile` the server runs, so the
 * user is told at once and nothing is sent that would be refused. The server
 * checks it again, and also checks the first bytes - which this component
 * cannot be trusted to do (ADR-0019).
 *
 * The preview is an object URL for the chosen file, revoked when it is
 * replaced and when the component is destroyed.
 */

type UploadState =
  | { readonly state: 'idle' }
  | { readonly state: 'invalid'; readonly reasonKey: string; readonly params: object }
  | { readonly state: 'ready'; readonly file: File; readonly preview: string | null }
  | {
      readonly state: 'uploading';
      readonly file: File;
      readonly preview: string | null;
      readonly percent: number | null;
    }
  | {
      readonly state: 'failed';
      readonly file: File;
      readonly preview: string | null;
      readonly errorKey: string;
    };

@Component({
  selector: 'app-customer-avatar',
  imports: [Button, FileDrop, IfPermitted, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="avatar" *transloco="let t" [attr.aria-label]="t('customers.avatar.region')">
      <div class="avatar__picture">
        @if (preview(); as src) {
          <img [src]="src" [alt]="t('customers.avatar.previewAlt')" data-testid="avatar-preview" />
        } @else if (currentUrl(); as src) {
          <img
            [src]="src"
            [alt]="t('customers.avatar.currentAlt', { name: customer().fullName })"
            data-testid="avatar-current"
          />
        } @else {
          <span class="avatar__initials" aria-hidden="true">{{ initials() }}</span>
        }
      </div>

      <div class="avatar__controls" *appIfPermitted="'CUSTOMER_UPDATE'">
        @switch (upload().state) {
          @case ('uploading') {
            <div class="avatar__progress" data-testid="avatar-progress">
              <progress
                [attr.value]="percent()"
                max="100"
                [attr.aria-label]="t('customers.avatar.uploading')"
              ></progress>
              <span role="status">
                {{
                  percent() === null
                    ? t('customers.avatar.uploading')
                    : t('customers.avatar.uploadingPercent', { percent: percent() })
                }}
              </span>
            </div>
            <app-button size="sm" (click)="cancel()" data-testid="avatar-cancel">
              {{ t('customers.avatar.cancel') }}
            </app-button>
          }

          @default {
            <app-file-drop
              [label]="t('customers.avatar.choose')"
              [hint]="t('customers.avatar.hint', { types: typesLabel, size: maxSizeMb })"
              [accept]="accept"
              (fileSelected)="choose($event)"
            />

            @if (upload(); as current) {
              @if (current.state === 'invalid') {
                <p class="avatar__error" role="alert" data-testid="avatar-invalid">
                  {{ t(current.reasonKey, current.params) }}
                </p>
              }
              @if (current.state === 'failed') {
                <p class="avatar__error" role="alert" data-testid="avatar-failed">
                  {{ t('customers.avatar.failed') }} {{ t(current.errorKey) }}
                </p>
              }
            }

            @if (hasFile()) {
              <div class="avatar__actions">
                <app-button
                  size="sm"
                  variant="primary"
                  (click)="start()"
                  data-testid="avatar-upload"
                >
                  {{
                    upload().state === 'failed'
                      ? t('customers.avatar.retry')
                      : t('customers.avatar.upload')
                  }}
                </app-button>
                <app-button size="sm" variant="ghost" (click)="discard()">
                  {{ t('customers.avatar.discard') }}
                </app-button>
              </div>
            }
          }
        }
      </div>
    </section>
  `,
  styles: `
    .avatar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--space-4);
    }

    .avatar__picture {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 6rem;
      height: 6rem;
      overflow: hidden;
      border-radius: 50%;
      background-color: var(--surface-sunken);
      flex: none;
    }

    .avatar__picture img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar__initials {
      color: var(--text-secondary);
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
    }

    .avatar__controls {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 14rem;
    }

    .avatar__progress {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }

    .avatar__actions {
      display: flex;
      gap: var(--space-2);
    }

    .avatar__error {
      margin: 0;
      color: var(--danger-text);
      font-size: var(--text-sm);
    }
  `,
})
export class CustomerAvatar {
  readonly customer = input.required<Customer>();

  private readonly store = inject(CustomerStore);
  private readonly notifications = inject(NotificationService);
  private readonly objectUrls = inject(OBJECT_URLS);

  protected readonly upload = signal<UploadState>({ state: 'idle' });
  private transfer: Subscription | null = null;

  protected readonly accept = [...AVATAR_ALLOWED_EXTENSIONS, ...AVATAR_ALLOWED_MIME_TYPES].join(
    ',',
  );
  protected readonly typesLabel = AVATAR_ALLOWED_EXTENSIONS.join(', ');
  protected readonly maxSizeMb = AVATAR_FILE_POLICY.maxBytes / (1024 * 1024);

  /** Cache-busted by version: the URL is the same after a replacement. */
  protected readonly currentUrl = computed(() => {
    const customer = this.customer();
    return customer.avatarUrl ? `${customer.avatarUrl}?v=${customer.version}` : null;
  });

  protected readonly initials = computed(() =>
    this.customer()
      .fullName.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected readonly preview = computed(() => {
    const current = this.upload();
    return 'preview' in current ? current.preview : null;
  });

  protected readonly hasFile = computed(() => {
    const state = this.upload().state;
    return state === 'ready' || state === 'failed';
  });

  protected readonly percent = computed(() => {
    const current = this.upload();
    return current.state === 'uploading' ? current.percent : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      // Leaving the page cancels the upload and frees the preview.
      this.transfer?.unsubscribe();
      this.releasePreview();
    });
  }

  protected choose(file: File): void {
    this.releasePreview();
    const rejection = checkFile(file, AVATAR_FILE_POLICY);
    if (rejection) {
      this.upload.set({
        state: 'invalid',
        reasonKey: fileRejectionKey(rejection),
        params: fileRejectionParams(AVATAR_FILE_POLICY),
      });
      return;
    }
    this.upload.set({ state: 'ready', file, preview: this.objectUrls.create(file) });
  }

  protected start(): void {
    const current = this.upload();
    if (current.state !== 'ready' && current.state !== 'failed') {
      return;
    }
    const { file, preview } = current;
    this.upload.set({ state: 'uploading', file, preview, percent: 0 });

    this.transfer = this.store.uploadAvatar(this.customer().id, file).subscribe({
      next: (transfer) => {
        if (transfer.kind === 'done') {
          this.transfer = null;
          this.releasePreview();
          this.upload.set({ state: 'idle' });
          this.notifications.toast('customers.avatar.done');
          return;
        }
        const fraction = fractionOf(transfer);
        this.upload.set({
          state: 'uploading',
          file,
          preview,
          percent: fraction === null ? null : Math.round(fraction * 100),
        });
      },
      error: (error: unknown) => {
        this.transfer = null;
        this.upload.set({ state: 'failed', file, preview, errorKey: messageKeyOf(error) });
      },
    });
  }

  /** Aborts the request; the chosen file stays, ready to try again. */
  protected cancel(): void {
    const current = this.upload();
    this.transfer?.unsubscribe();
    this.transfer = null;
    if (current.state === 'uploading') {
      this.upload.set({ state: 'ready', file: current.file, preview: current.preview });
      this.notifications.toast('customers.avatar.cancelled', { tone: 'info' });
    }
  }

  protected discard(): void {
    this.releasePreview();
    this.upload.set({ state: 'idle' });
  }

  private releasePreview(): void {
    const preview = this.preview();
    if (preview) {
      this.objectUrls.revoke(preview);
    }
  }
}
