import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../layout/page-container';
import { PageHeader } from '../layout/page-header';
import { Badge } from '../shared/ui/badge/badge';
import { TECHNICAL_LABS } from './lab-catalog';

/**
 * The lab index.
 *
 * Rendered from the catalogue rather than written out, so a lab that exists in
 * routing and not on this page - or the reverse - is impossible.
 *
 * Each card is a link, not a card with a button in it: the whole row is the
 * target, it works with middle click, and a screen reader lists it among the
 * page's links.
 */
@Component({
  selector: 'app-labs-index-page',
  imports: [Badge, PageContainer, PageHeader, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.labs.index.heading')"
        [description]="t('pages.labs.index.description')"
      />

      <ul class="labs">
        @for (lab of labs; track lab.id) {
          <li>
            <a class="labs__card" [routerLink]="lab.id">
              <span class="labs__title">{{ t(lab.titleKey) }}</span>
              <span class="labs__description">{{ t(lab.descriptionKey) }}</span>

              @if (lab.plannedPhase === null) {
                <app-badge tone="success">{{ t('pages.labs.index.available') }}</app-badge>
              } @else {
                <app-badge>
                  {{ t('pages.labs.index.plannedForPhase', { phase: lab.plannedPhase }) }}
                </app-badge>
              }
            </a>
          </li>
        }
      </ul>
    </app-page-container>
  `,
  styles: `
    .labs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .labs__card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      height: 100%;
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
      color: var(--text-primary);
      text-decoration: none;
      transition: border-color var(--motion-fast) var(--motion-ease);
    }

    .labs__card:hover {
      border-color: var(--accent);
    }

    .labs__title {
      font-weight: var(--weight-semibold);
    }

    .labs__description {
      flex: 1;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class LabsIndexPage {
  protected readonly labs = TECHNICAL_LABS;
}
