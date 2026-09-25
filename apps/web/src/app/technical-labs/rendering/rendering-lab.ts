import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { LabSection } from '../lab-section';
import { PageLoadMetrics } from './page-load-metrics';
import { RENDERING_SPECIMENS, specimenPath, type SpecimenId } from './rendering-specimens';

/**
 * The rendering lab's index: what each specimen is, a way to open it, and the
 * numbers for *this* page - which, being inside the authenticated shell, is
 * itself a client-rendered page, the mode the application uses.
 *
 * The comparison under controlled conditions is `perf/measure-rendering.ts`;
 * its results are in docs/rendering.md. Numbers from a page opened by hand
 * are real, but they measure one load on one machine, and the lab says so.
 */
@Component({
  selector: 'app-rendering-lab',
  imports: [LabSection, PageContainer, PageHeader, PageLoadMetrics, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.rendering'">
      <app-page-header [heading]="t('heading')" [description]="t('lede')" />

      <app-lab-section
        sectionId="specimens"
        [heading]="t('specimens.heading')"
        [description]="t('specimens.description')"
      >
        <table class="lab-table">
          <thead>
            <tr>
              <th scope="col">{{ t('specimens.mode') }}</th>
              <th scope="col">{{ t('specimens.source') }}</th>
              <th scope="col">{{ t('specimens.hydration') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (specimen of specimens; track specimen.id) {
              <tr>
                <td>
                  <a [href]="pathOf(specimen.id)" [attr.data-testid]="'specimen-' + specimen.id">
                    {{ t('modes.' + specimen.id + '.name') }}
                  </a>
                </td>
                <td>{{ t('sources.' + specimen.source) }}</td>
                <td>{{ t('hydrations.' + specimen.hydration) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </app-lab-section>

      <app-lab-section
        sectionId="this-page"
        [heading]="t('thisPage.heading')"
        [description]="t('thisPage.description')"
      >
        <app-page-load-metrics />
      </app-lab-section>

      <app-lab-section
        sectionId="results"
        [heading]="t('results.heading')"
        [description]="t('results.description')"
      />
    </app-page-container>
  `,
  styles: `
    .lab-table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: var(--space-2);
      border-block-end: var(--border-width) solid var(--border-subtle);
      text-align: start;
    }
  `,
})
export class RenderingLab {
  protected readonly specimens = RENDERING_SPECIMENS;

  protected pathOf(id: SpecimenId): string {
    return specimenPath(id);
  }
}
