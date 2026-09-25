import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { WINDOW } from '../../core/platform/platform.tokens';

/** How many leading bytes to show - enough for any common file signature. */
export const SIGNATURE_BYTES = 8;
/** How much of a text file to preview. */
export const PREVIEW_CHARACTERS = 200;

export interface FileFacts {
  readonly name: string;
  readonly size: number;
  /** What the browser guessed from the extension. Not evidence of anything. */
  readonly type: string;
  readonly lastModified: number;
  /** The first bytes, in hex: what the file *is*, whatever it is called. */
  readonly signature: string;
  readonly sha256: string | null;
  readonly preview: string | null;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

/**
 * Reads a file the user chose - without uploading it.
 *
 * Everything here happens in the page: `File` is a `Blob` with a name, and
 * `slice()`, `arrayBuffer()` and `text()` read it lazily and asynchronously.
 * `slice(0, 8)` reads eight bytes, not the whole file - which is how the
 * avatar upload checks a signature (ADR-0019) without loading a 5 MB image
 * into memory first. The digest uses Web Crypto, which needs the whole file,
 * so it is skipped past a size where it would stall the tab.
 */
export async function readFileFacts(file: File, subtle: SubtleCrypto | null): Promise<FileFacts> {
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  const hashable = subtle && file.size <= 50 * 1024 * 1024;
  const digest = hashable
    ? new Uint8Array(await subtle.digest('SHA-256', await file.arrayBuffer()))
    : null;
  const textual = file.type.startsWith('text/') || /\.(csv|txt|json|md)$/i.test(file.name);
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    signature: toHex(head),
    sha256: digest ? toHex(digest).replaceAll(' ', '') : null,
    preview: textual
      ? (await file.slice(0, PREVIEW_CHARACTERS * 4).text()).slice(0, PREVIEW_CHARACTERS)
      : null,
  };
}

@Component({
  selector: 'app-file-demo',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.file'">
      <label class="picker">
        <span>{{ t('choose') }}</span>
        <input type="file" data-testid="file-input" (change)="read($event)" />
      </label>
      @if (facts(); as file) {
        <dl class="readout" data-testid="file-facts">
          <div>
            <dt>{{ t('name') }}</dt>
            <dd>{{ file.name }}</dd>
          </div>
          <div>
            <dt>{{ t('size') }}</dt>
            <dd data-testid="file-size">{{ t('bytes', { count: file.size }) }}</dd>
          </div>
          <div>
            <dt>{{ t('type') }}</dt>
            <dd>{{ file.type || t('unknownType') }}</dd>
          </div>
          <div>
            <dt>{{ t('signature') }}</dt>
            <dd data-testid="file-signature">
              <code>{{ file.signature }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ t('sha256') }}</dt>
            <dd data-testid="file-sha256">
              <code>{{ file.sha256 ?? t('tooLarge') }}</code>
            </dd>
          </div>
          @if (file.preview !== null) {
            <div>
              <dt>{{ t('preview') }}</dt>
              <dd>
                <pre data-testid="file-preview">{{ file.preview }}</pre>
              </dd>
            </div>
          }
        </dl>
      }
      @if (failed()) {
        <p role="alert">{{ t('failed') }}</p>
      }
    </div>
  `,
  styles: `
    .demo,
    .picker {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .readout {
      display: grid;
      gap: var(--space-2);
      margin: 0;
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
    }
  `,
})
export class FileDemo {
  private readonly subtle = inject(WINDOW)?.crypto?.subtle ?? null;

  protected readonly facts = signal<FileFacts | null>(null);
  protected readonly failed = signal(false);

  protected async read(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    try {
      this.facts.set(await readFileFacts(file, this.subtle));
      this.failed.set(false);
    } catch {
      // The file vanished or became unreadable between choosing and reading.
      this.failed.set(true);
    }
  }
}
