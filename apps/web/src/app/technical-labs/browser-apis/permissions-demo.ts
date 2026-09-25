import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { NAVIGATOR } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';

/** The permissions this lab asks about. Names as the Permissions API spells them. */
export const LAB_PERMISSIONS = [
  'geolocation',
  'notifications',
  'clipboard-read',
  'clipboard-write',
  'persistent-storage',
] as const;

export type LabPermission = (typeof LAB_PERMISSIONS)[number];
export type PermissionReport = PermissionState | 'unsupported';

/**
 * Asks the Permissions API for the state of each permission - without asking
 * the *user* anything.
 *
 * `query()` is read-only: it answers `granted`, `denied` or `prompt` (the
 * browser would ask). It is how a page decides whether to show a "use my
 * location" button at all, or an explanation of how to re-enable a refused
 * permission - the page cannot re-prompt once the user said no.
 *
 * Support is uneven: not every browser knows every name (Firefox rejects
 * `clipboard-read`), and an unknown name rejects the promise rather than
 * answering. That is `unsupported` here, per permission.
 */
export async function queryPermissions(
  permissions: Permissions | null,
): Promise<Record<LabPermission, PermissionReport>> {
  const entries = await Promise.all(
    LAB_PERMISSIONS.map(async (name): Promise<[LabPermission, PermissionReport]> => {
      if (!permissions) {
        return [name, 'unsupported'];
      }
      try {
        const status = await permissions.query({ name: name as PermissionName });
        return [name, status.state];
      } catch {
        return [name, 'unsupported'];
      }
    }),
  );
  return Object.fromEntries(entries) as Record<LabPermission, PermissionReport>;
}

@Component({
  selector: 'app-permissions-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.permissions'">
      <app-button data-testid="permissions-query" (click)="query()">{{ t('query') }}</app-button>
      @if (report(); as states) {
        <table class="states" data-testid="permission-states">
          <tbody>
            @for (name of names; track name) {
              <tr>
                <th scope="row">{{ name }}</th>
                <td [attr.data-testid]="'permission-' + name">{{ t('state.' + states[name]) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    th,
    td {
      padding: var(--space-1) var(--space-3);
      text-align: start;
    }
  `,
})
export class PermissionsDemo {
  private readonly permissions = inject(NAVIGATOR)?.permissions ?? null;

  protected readonly names = LAB_PERMISSIONS;
  protected readonly report = signal<Record<LabPermission, PermissionReport> | null>(null);

  protected async query(): Promise<void> {
    this.report.set(await queryPermissions(this.permissions));
  }
}
