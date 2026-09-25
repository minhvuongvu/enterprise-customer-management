import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { NAVIGATOR } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';

type ClipboardOutcome = 'copied' | 'read' | 'denied' | 'unsupported';

/** What the demo copies: an identifier, the kind of thing a back office copies all day. */
export const CLIPBOARD_SAMPLE = 'C-000042';

/**
 * The async Clipboard API.
 *
 * Writing text is allowed from a user gesture - a click - on a secure origin,
 * without asking. Reading is different: the clipboard may hold anything the
 * user copied anywhere, so the browser asks for permission (Chromium) or
 * shows a paste prompt (Safari, Firefox). Both calls are promises that
 * reject when refused; neither ever throws synchronously in a supporting
 * browser, and `navigator.clipboard` is simply missing on an insecure origin.
 */
@Component({
  selector: 'app-clipboard-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.clipboard'">
      <div class="actions">
        <app-button data-testid="clipboard-copy" (click)="copy()">
          {{ t('copy', { value: sample }) }}
        </app-button>
        <app-button data-testid="clipboard-read" (click)="read()">{{ t('read') }}</app-button>
      </div>
      @if (outcome(); as result) {
        <p role="status" data-testid="clipboard-outcome">
          {{ t('outcome.' + result, { value: pasted() ?? '' }) }}
        </p>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class ClipboardDemo {
  private readonly clipboard = inject(NAVIGATOR)?.clipboard ?? null;

  protected readonly sample = CLIPBOARD_SAMPLE;
  protected readonly outcome = signal<ClipboardOutcome | null>(null);
  protected readonly pasted = signal<string | null>(null);

  protected async copy(): Promise<void> {
    if (!this.clipboard) {
      this.outcome.set('unsupported');
      return;
    }
    try {
      await this.clipboard.writeText(CLIPBOARD_SAMPLE);
      this.outcome.set('copied');
    } catch {
      this.outcome.set('denied');
    }
  }

  protected async read(): Promise<void> {
    if (!this.clipboard) {
      this.outcome.set('unsupported');
      return;
    }
    try {
      this.pasted.set(await this.clipboard.readText());
      this.outcome.set('read');
    } catch {
      this.outcome.set('denied');
    }
  }
}
