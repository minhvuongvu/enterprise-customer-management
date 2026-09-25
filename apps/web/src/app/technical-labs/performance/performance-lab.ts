import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { LabSection } from '../lab-section';
import { DerivedStateDemo } from './derived-state-demo';
import { ImageDemo } from './image-demo';
import { InputRateDemo } from './input-rate-demo';
import { generateDataset } from './performance-dataset';
import { VirtualScrollDemo } from './virtual-scroll-demo';

/**
 * The performance lab: one large dataset, and each technique measured against
 * its absence on it (docs/performance.md).
 *
 * The virtual-scrolling demo sits in a `@defer (on viewport)` block, which is
 * itself one of the techniques: the CDK scrolling code is split into its own
 * chunk and fetched only when the section scrolls into view. The build output
 * names that chunk; docs/performance.md records its size.
 */
@Component({
  selector: 'app-performance-lab',
  imports: [
    DerivedStateDemo,
    ImageDemo,
    InputRateDemo,
    LabSection,
    PageContainer,
    PageHeader,
    TranslocoDirective,
    VirtualScrollDemo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.performance'">
      <app-page-header [heading]="t('heading')" [description]="t('lede', { count: rows.length })" />

      <app-lab-section
        sectionId="debounce"
        [heading]="t('rate.heading')"
        [description]="t('rate.description')"
      >
        <app-input-rate-demo [rows]="rows" />
      </app-lab-section>

      <app-lab-section
        sectionId="derived"
        [heading]="t('derived.heading')"
        [description]="t('derived.description')"
      >
        <app-derived-state-demo [rows]="rows" />
      </app-lab-section>

      <app-lab-section
        sectionId="images"
        [heading]="t('images.heading')"
        [description]="t('images.description')"
      >
        <app-image-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="virtual"
        [heading]="t('virtual.heading')"
        [description]="t('virtual.description')"
      >
        @defer (on viewport) {
          <app-virtual-scroll-demo [rows]="rows" />
        } @placeholder {
          <p>{{ t('virtual.deferred') }}</p>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="splitting"
        [heading]="t('splitting.heading')"
        [description]="t('splitting.description')"
      />
    </app-page-container>
  `,
})
export class PerformanceLab {
  /** Generated once per visit to the page; roughly 30 ms for 100,000 rows. */
  protected readonly rows = generateDataset();
}
