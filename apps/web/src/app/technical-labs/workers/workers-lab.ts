import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { LabSection } from '../lab-section';
import { ServiceWorkerStatus } from './service-worker-status';
import { WorkerDemo } from './worker-demo';

/** Work off the main thread, and a worker between the page and the network. */
@Component({
  selector: 'app-workers-lab',
  imports: [
    LabSection,
    PageContainer,
    PageHeader,
    ServiceWorkerStatus,
    TranslocoDirective,
    WorkerDemo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.workers'">
      <app-page-header [heading]="t('heading')" [description]="t('description')" />

      <app-lab-section
        sectionId="web-worker"
        [heading]="t('worker.heading')"
        [description]="t('worker.description')"
      >
        <app-worker-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="service-worker"
        [heading]="t('serviceWorker.heading')"
        [description]="t('serviceWorker.description')"
      >
        <app-service-worker-status />
      </app-lab-section>
    </app-page-container>
  `,
})
export class WorkersLab {}
