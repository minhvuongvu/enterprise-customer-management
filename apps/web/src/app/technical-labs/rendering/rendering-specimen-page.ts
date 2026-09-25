import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageLoadMetrics } from './page-load-metrics';
import {
  RENDERING_SPECIMENS,
  specimenPath,
  specimenRows,
  type RenderingSpecimen,
  type SpecimenId,
} from './rendering-specimens';
import { SpecimenCatalogue } from './specimen-catalogue';

/**
 * The page every rendering specimen serves (ADR-0026).
 *
 * The top of the page - heading, a counter button, this load's own metrics -
 * fills the first screen. The catalogue is below the fold, and it is the only
 * thing that differs between specimens, in how it meets the browser:
 *
 *  - `full`         hydrated with the rest of the page;
 *  - `destructive`  `ngSkipHydration`: the server's HTML for it is thrown away
 *                   and rebuilt in the browser - hydration switched off for
 *                   one subtree, which is how its saving becomes measurable;
 *  - `incremental`  `@defer (hydrate on viewport)`: the server's HTML stays,
 *                   inert, until the user scrolls to it. Until then its
 *                   buttons do nothing, and event replay keeps any click made
 *                   in the meantime.
 *
 * Links between specimens are plain `href`s on purpose. A router link would
 * navigate inside the already-running application, and the whole point is a
 * fresh document load from the server.
 *
 * `noindex`: these pages are public only so that the server can render them
 * without a session. They are not content for a crawler (§7.1).
 */
@Component({
  selector: 'app-rendering-specimen-page',
  imports: [PageLoadMetrics, SpecimenCatalogue, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="specimen" *transloco="let t; prefix: 'pages.labs.rendering'">
      <section class="specimen__hero">
        <h1>{{ t('specimen.heading', { mode: t('modes.' + definition().id + '.name') }) }}</h1>
        <p class="specimen__lede">{{ t('modes.' + definition().id + '.summary') }}</p>
        <p>{{ t('specimen.intro') }}</p>

        <div class="specimen__actions">
          <button
            type="button"
            class="specimen__button"
            data-testid="specimen-counter"
            (click)="clicks.set(clicks() + 1)"
          >
            {{ t('specimen.clicks', { count: clicks() }) }}
          </button>
        </div>

        <app-page-load-metrics />

        <nav class="specimen__nav" [attr.aria-label]="t('specimen.otherModes')">
          <ul>
            @for (other of specimens; track other.id) {
              <li>
                <a
                  [href]="pathOf(other.id)"
                  [attr.aria-current]="other.id === definition().id ? 'page' : null"
                >
                  {{ t('modes.' + other.id + '.name') }}
                </a>
              </li>
            }
            <li>
              <a [href]="labPath">{{ t('specimen.backToLab') }}</a>
            </li>
          </ul>
        </nav>
      </section>

      @switch (definition().hydration) {
        @case ('destructive') {
          <app-specimen-catalogue ngSkipHydration [rows]="rows" />
        }
        @case ('incremental') {
          @defer (hydrate on viewport) {
            <app-specimen-catalogue [rows]="rows" />
          }
        }
        @default {
          <app-specimen-catalogue [rows]="rows" />
        }
      }
    </main>
  `,
  styles: `
    .specimen {
      max-width: var(--layout-content-max);
      margin: 0 auto;
      padding: var(--space-5) var(--space-4);
    }

    /* The first screen. Keeps the catalogue below the fold in every
       specimen, so "hydrate on viewport" has a viewport to wait for. */
    .specimen__hero {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-height: 100vh;
    }

    .specimen__lede {
      max-width: 62ch;
      font-size: var(--text-lg);
    }

    .specimen__button {
      padding: var(--space-2) var(--space-4);
      border: none;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--text-on-accent);
      cursor: pointer;
    }

    .specimen__nav ul {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class RenderingSpecimenPage {
  /** From the route's `data`, bound by `withComponentInputBinding`. */
  readonly specimen = input.required<SpecimenId>();

  protected readonly specimens = RENDERING_SPECIMENS;
  protected readonly definition = computed<RenderingSpecimen>(
    () =>
      RENDERING_SPECIMENS.find((candidate) => candidate.id === this.specimen()) ??
      RENDERING_SPECIMENS[0],
  );
  protected readonly rows = specimenRows();
  protected readonly clicks = signal(0);
  protected readonly labPath = '/technical-labs/rendering';

  constructor() {
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => meta.removeTag("name='robots'"));
  }

  protected pathOf(id: SpecimenId): string {
    return specimenPath(id);
  }
}
