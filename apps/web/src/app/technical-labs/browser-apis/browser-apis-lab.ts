import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { LabSection } from '../lab-section';
import { ClipboardDemo } from './clipboard-demo';
import { FileDemo } from './file-demo';
import { GeolocationDemo } from './geolocation-demo';
import { HistoryDemo } from './history-demo';
import { PermissionsDemo } from './permissions-demo';
import { UrlDemo } from './url-demo';

/**
 * Browser capabilities with no place in the customer workflow, one section
 * each (docs/browser-capabilities.md).
 *
 * Each demo reaches the browser only through the platform tokens - `WINDOW`,
 * `NAVIGATOR` - so the page builds for the server like every other, and each
 * feature-tests what it needs rather than assuming it: a capability can be
 * missing (an old browser), refused (a permission), or withheld (an insecure
 * origin), and all three are ordinary outcomes here.
 */
@Component({
  selector: 'app-browser-apis-lab',
  imports: [
    ClipboardDemo,
    FileDemo,
    GeolocationDemo,
    HistoryDemo,
    LabSection,
    PageContainer,
    PageHeader,
    PermissionsDemo,
    TranslocoDirective,
    UrlDemo,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.browserApis'">
      <app-page-header [heading]="t('heading')" [description]="t('description')" />

      <app-lab-section
        sectionId="url"
        [heading]="t('url.heading')"
        [description]="t('url.description')"
      >
        <app-url-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="history"
        [heading]="t('history.heading')"
        [description]="t('history.description')"
      >
        <app-history-demo [step]="step()" />
      </app-lab-section>

      <app-lab-section
        sectionId="file"
        [heading]="t('file.heading')"
        [description]="t('file.description')"
      >
        <app-file-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="clipboard"
        [heading]="t('clipboard.heading')"
        [description]="t('clipboard.description')"
      >
        <app-clipboard-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="permissions"
        [heading]="t('permissions.heading')"
        [description]="t('permissions.description')"
      >
        <app-permissions-demo />
      </app-lab-section>

      <app-lab-section
        sectionId="geolocation"
        [heading]="t('geolocation.heading')"
        [description]="t('geolocation.description')"
      >
        <app-geolocation-demo />
      </app-lab-section>
    </app-page-container>
  `,
})
export class BrowserApisLab {
  /** The history demo's `?step=` query parameter, bound by the router. */
  readonly step = input<string>();
}
