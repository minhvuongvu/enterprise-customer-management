import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A page's title, its explanation, and the actions that belong to the page as
 * a whole.
 *
 * The action area is projected rather than configured. A `[actions]` input
 * taking a list of button descriptors would have to grow icons, tones,
 * disabled reasons, permissions and eventually a split button - and every one
 * of those would be business knowledge inside a layout component. A slot has
 * none of that problem: the caller writes the buttons it wants.
 *
 * It renders the page's only `<h1>`. One per page, and it is the heading the
 * document title is derived from, so the two say the same thing.
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header__text">
        <h1>{{ heading() }}</h1>
        @if (description()) {
          <p class="page-header__description">{{ description() }}</p>
        }
      </div>

      <div class="page-header__actions"><ng-content select="[pageActions]" /></div>
    </div>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .page-header__text {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .page-header__description {
      max-width: 62ch;
      color: var(--text-secondary);
    }

    .page-header__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .page-header__actions:empty {
      display: none;
    }

    /* On a phone the actions are a full-width row under the title rather than
       three cramped buttons squeezed beside it. */
    @media #{bp.$below-tablet} {
      .page-header {
        flex-direction: column;
      }

      .page-header__actions {
        width: 100%;
      }

      .page-header__actions ::ng-deep app-button {
        flex: 1 1 auto;
      }
    }
  `,
})
export class PageHeader {
  /** Already translated. */
  readonly heading = input.required<string>();
  readonly description = input('');
}
