import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { LabSection } from '../lab-section';
import { OfflineDirectory } from './offline-directory';
import { OfflineDirectoryApi } from './offline-directory.api';

/**
 * A read-only customer list that keeps working without a network - the one
 * offline scenario this application implements (docs/offline.md).
 *
 * To try it: open the page online, then switch the browser offline (DevTools
 * → Network → Offline) and reload the lab from the sidebar. The list comes
 * back from IndexedDB, labelled as a saved copy. Switch back online and it
 * refreshes by itself.
 */
@Component({
  selector: 'app-offline-lab',
  imports: [Badge, Button, DatePipe, LabSection, PageContainer, PageHeader, TranslocoDirective],
  providers: [OfflineDirectory, OfflineDirectoryApi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.offline'">
      <app-page-header [heading]="t('heading')" [description]="t('lede')" />

      <app-lab-section
        sectionId="connectivity"
        [heading]="t('connectivity.heading')"
        [description]="t('connectivity.description')"
      >
        <p data-testid="lab-connectivity" [attr.data-online]="directory.online()">
          <app-badge [tone]="directory.online() ? 'success' : 'warning'">
            {{ directory.online() ? t('connectivity.online') : t('connectivity.offline') }}
          </app-badge>
        </p>
      </app-lab-section>

      <app-lab-section
        sectionId="directory"
        [heading]="t('directory.heading')"
        [description]="t('directory.description')"
      >
        @let state = directory.state();
        <p data-testid="directory-source" [attr.data-source]="state.source" role="status">
          @switch (state.source) {
            @case ('network') {
              {{ t('directory.fromNetwork', { at: state.asOf | date: 'medium' }) }}
            }
            @case ('saved') {
              {{ t('directory.fromSaved', { at: state.asOf | date: 'medium' }) }}
            }
            @default {
              {{ state.loading ? t('directory.loading') : t('directory.nothing') }}
            }
          }
        </p>
        <div class="actions">
          <app-button data-testid="directory-refresh" [loading]="state.loading" (click)="refresh()">
            {{ t('directory.refresh') }}
          </app-button>
          <app-button data-testid="directory-forget" (click)="forget()">
            {{ t('directory.forget') }}
          </app-button>
        </div>
        @if (state.customers.length) {
          <table class="directory" data-testid="directory-rows">
            <thead>
              <tr>
                <th scope="col">{{ t('directory.code') }}</th>
                <th scope="col">{{ t('directory.name') }}</th>
                <th scope="col">{{ t('directory.status') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (customer of state.customers; track customer.id) {
                <tr>
                  <td>{{ customer.customerCode }}</td>
                  <td>{{ customer.fullName }}</td>
                  <td>{{ t('directory.statuses.' + customer.status) }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="limits"
        [heading]="t('limits.heading')"
        [description]="t('limits.description')"
      />
    </app-page-container>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .directory {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: var(--space-1) var(--space-2);
      border-block-end: var(--border-width) solid var(--border-subtle);
      text-align: start;
    }
  `,
})
export class OfflineLab {
  protected readonly directory = inject(OfflineDirectory);

  constructor() {
    void this.directory.load();
  }

  protected refresh(): void {
    void this.directory.load();
  }

  protected forget(): void {
    void this.directory.forget();
  }
}
