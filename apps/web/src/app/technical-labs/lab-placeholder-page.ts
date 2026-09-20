import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../layout/page-container';
import { PageHeader } from '../layout/page-header';
import { Button } from '../shared/ui/button/button';
import { EmptyState } from '../shared/ui/empty-state/empty-state';
import { findLab } from './lab-catalog';

/**
 * Stands in for every lab that has not been built yet.
 *
 * The page is rendered from the catalogue entry named by `:labId`, which is
 * why one component covers five planned labs. An unknown id is not silently
 * tolerated: it renders as not found, because a link to `/technical-labs/
 * typo` is a broken link and should look like one.
 */
@Component({
  selector: 'app-lab-placeholder-page',
  imports: [Button, EmptyState, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      @if (lab(); as descriptor) {
        <app-page-header
          [heading]="t(descriptor.titleKey)"
          [description]="t(descriptor.descriptionKey)"
        >
          <div pageActions>
            <app-button link="/technical-labs">{{ t('pages.labs.backToIndex') }}</app-button>
          </div>
        </app-page-header>

        <app-empty-state
          [heading]="t('pages.labs.placeholder.heading')"
          [description]="t('pages.labs.placeholder.body', { phase: descriptor.plannedPhase })"
        />
      } @else {
        <app-page-header [heading]="t('pages.labs.unknown.heading')" />

        <app-empty-state
          [heading]="t('pages.labs.unknown.body')"
          [description]="t('pages.labs.unknown.hint')"
        >
          <app-button link="/technical-labs">{{ t('pages.labs.backToIndex') }}</app-button>
        </app-empty-state>
      }
    </app-page-container>
  `,
})
export class LabPlaceholderPage {
  /** From the `:labId` route parameter. */
  readonly labId = input.required<string>();

  protected readonly lab = computed(() => findLab(this.labId()) ?? null);
}
