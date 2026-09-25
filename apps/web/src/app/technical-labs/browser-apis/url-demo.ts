import { ChangeDetectionStrategy, Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { TextInput } from '../../shared/ui/text-input/text-input';

export interface UrlParts {
  readonly href: string;
  readonly protocol: string;
  readonly host: string;
  readonly pathname: string;
  readonly hash: string;
  readonly params: readonly (readonly [string, string])[];
  /** Whether it points somewhere other than this application's origin. */
  readonly crossOrigin: boolean;
}

/**
 * Parses what a user typed with the URL API, relative to this page.
 *
 * `new URL()` is the parser the browser itself uses, so it agrees with the
 * browser about every edge case string manipulation gets wrong - encoded
 * characters, `..` segments, a missing scheme, `//host` without one. It
 * throws on what it cannot parse; `null` here.
 *
 * `searchParams` decodes each value and keeps repeated keys, which a
 * `split('&')` does not. The origin comparison is the one `safeReturnUrl`
 * relies on in `core/auth`: parse, then compare origins - never a
 * `startsWith` on the string.
 */
export function describeUrl(input: string, base: string): UrlParts | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  return {
    href: url.href,
    protocol: url.protocol,
    host: url.host,
    pathname: url.pathname,
    hash: url.hash,
    params: [...url.searchParams.entries()],
    crossOrigin: url.origin !== new URL(base).origin,
  };
}

/** Where relative input is resolved from. A constant, so the demo reads the same everywhere. */
export const URL_DEMO_BASE = 'https://customers.example.test/customers?page=2';

@Component({
  selector: 'app-url-demo',
  imports: [ReactiveFormsModule, TextInput, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.url'">
      <app-text-input
        name="url-input"
        data-testid="url-input"
        [label]="t('label')"
        [hint]="t('hint', { base: base })"
        [formControl]="input"
      />
      @if (parts(); as url) {
        <dl class="readout" data-testid="url-parts">
          <div>
            <dt>{{ t('href') }}</dt>
            <dd data-testid="url-href">{{ url.href }}</dd>
          </div>
          <div>
            <dt>{{ t('host') }}</dt>
            <dd>{{ url.host }}</dd>
          </div>
          <div>
            <dt>{{ t('path') }}</dt>
            <dd>{{ url.pathname }}</dd>
          </div>
          <div>
            <dt>{{ t('params') }}</dt>
            <dd data-testid="url-params">
              @for (param of url.params; track $index) {
                <code>{{ param[0] }}={{ param[1] }}</code>
              } @empty {
                {{ t('noParams') }}
              }
            </dd>
          </div>
          <div>
            <dt>{{ t('origin') }}</dt>
            <dd data-testid="url-origin">
              {{ url.crossOrigin ? t('crossOrigin') : t('sameOrigin') }}
            </dd>
          </div>
        </dl>
      } @else {
        <p data-testid="url-invalid">{{ t('invalid') }}</p>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
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
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class UrlDemo {
  protected readonly base = URL_DEMO_BASE;
  protected readonly input = new FormControl('../customers/42?tab=audit&tab=notes#top', {
    nonNullable: true,
  });
  private readonly value = toSignal(this.input.valueChanges, { initialValue: this.input.value });

  protected parts(): UrlParts | null {
    return describeUrl(this.value(), URL_DEMO_BASE);
  }
}
