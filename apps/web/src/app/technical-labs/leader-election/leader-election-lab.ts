import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { HealthApi } from '../../core/api/health.api';
import {
  BROADCAST_CHANNEL_FACTORY,
  LOCAL_STORAGE,
  WINDOW,
} from '../../core/platform/platform.tokens';
import { now, type Instant } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { LabSection } from '../lab-section';
import { LeaseElection, type Lease, type Role } from './lease-election';

/** How often the leader runs the shared job. */
export const JOB_INTERVAL_MS = 5_000;
export const LEADER_CHANNEL = 'ecm.lab.leader.v1';

interface JobResult {
  readonly customers: number;
  readonly producedBy: string;
  readonly at: Instant;
}

type LeaderMessage =
  | { readonly kind: 'result'; readonly result: JobResult }
  | { readonly kind: 'resigned'; readonly from: string };

function isLeaderMessage(data: unknown): data is LeaderMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const message = data as Record<string, unknown>;
  if (message['kind'] === 'resigned') {
    return typeof message['from'] === 'string';
  }
  const result = message['result'] as Record<string, unknown> | undefined;
  return (
    message['kind'] === 'result' &&
    typeof result?.['customers'] === 'number' &&
    typeof result['producedBy'] === 'string' &&
    typeof result['at'] === 'string'
  );
}

/**
 * Only one tab runs the periodic job; every tab sees its result
 * (docs/cross-tab.md, "Leader election").
 *
 * The job - asking the API how many customers exist - stands in for any
 * background poll that should not multiply with the number of open tabs.
 * The leader runs it every {@link JOB_INTERVAL_MS} and posts the result on a
 * `BroadcastChannel`; followers only listen.
 *
 * Open the lab in two or three tabs. One says "leader". Close it, and within
 * a heartbeat another takes over (it resigned on `pagehide`). Press "Freeze
 * heartbeat" instead, and the others take over only when the lease expires -
 * and the frozen tab, resumed, finds it has lost and steps down.
 */
@Component({
  selector: 'app-leader-election-lab',
  imports: [Badge, Button, DatePipe, LabSection, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.leaderElection'">
      <app-page-header [heading]="t('heading')" [description]="t('lede')" />

      <app-lab-section
        sectionId="this-tab"
        [heading]="t('thisTab.heading')"
        [description]="t('thisTab.description', { id: tabId })"
      >
        <p>
          <app-badge
            data-testid="leader-role"
            [attr.data-role]="role()"
            [tone]="role() === 'leader' ? 'success' : 'neutral'"
          >
            {{ t('roles.' + role()) }}
          </app-badge>
        </p>
        <p data-testid="lease-holder">
          @if (lease(); as current) {
            {{ t('thisTab.holder', { holder: current.holder }) }}
          } @else {
            {{ t('thisTab.noHolder') }}
          }
        </p>
        <div class="actions">
          @if (frozen()) {
            <app-button data-testid="leader-resume" (click)="resume()">
              {{ t('thisTab.resume') }}
            </app-button>
          } @else {
            <app-button data-testid="leader-freeze" (click)="freeze()">
              {{ t('thisTab.freeze') }}
            </app-button>
          }
        </div>
      </app-lab-section>

      <app-lab-section
        sectionId="job"
        [heading]="t('job.heading')"
        [description]="t('job.description', { seconds: jobSeconds })"
      >
        @if (lastResult(); as result) {
          <p data-testid="job-result" [attr.data-producer]="result.producedBy" aria-live="polite">
            {{
              t('job.result', {
                customers: result.customers,
                tab: result.producedBy === tabId ? t('job.thisTab') : result.producedBy,
                at: result.at | date: 'mediumTime',
              })
            }}
          </p>
        } @else {
          <p>{{ t('job.none') }}</p>
        }
        <p data-testid="jobs-run-here">{{ t('job.runHere', { count: jobsRunHere() }) }}</p>
      </app-lab-section>

      <app-lab-section sectionId="log" [heading]="t('log.heading')">
        <ol class="log">
          @for (entry of log(); track $index) {
            <li>{{ t('roles.' + entry.role) }} - {{ entry.at | date: 'mediumTime' }}</li>
          }
        </ol>
      </app-lab-section>
    </app-page-container>
  `,
  styles: `
    .actions {
      display: flex;
      gap: var(--space-2);
    }

    .log {
      margin: 0;
      padding-inline-start: var(--space-5);
    }
  `,
})
export class LeaderElectionLab {
  private readonly health = inject(HealthApi);

  protected readonly tabId: string;
  protected readonly jobSeconds = JOB_INTERVAL_MS / 1000;
  protected readonly role = signal<Role>('follower');
  protected readonly lease = signal<Lease | null>(null);
  protected readonly frozen = signal(false);
  protected readonly lastResult = signal<JobResult | null>(null);
  protected readonly jobsRunHere = signal(0);
  protected readonly log = signal<readonly { role: Role; at: Instant }[]>([]);

  private readonly election: LeaseElection | null = null;
  private readonly channel: BroadcastChannel | null;

  constructor() {
    const win = inject(WINDOW);
    this.tabId = win?.crypto.randomUUID().slice(0, 8) ?? 'server';
    this.channel = inject(BROADCAST_CHANNEL_FACTORY)(LEADER_CHANNEL);
    if (!win) {
      return;
    }

    this.election = new LeaseElection(
      this.tabId,
      {
        storage: inject(LOCAL_STORAGE),
        now: () => Date.now(),
        setTimeout: (callback, ms) => win.setTimeout(callback, ms),
        setInterval: (callback, ms) => win.setInterval(callback, ms),
        clearInterval: (handle) => win.clearInterval(handle as number),
      },
      (role, lease) => this.observe(role, lease),
    );

    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isLeaderMessage(event.data)) {
        return;
      }
      if (event.data.kind === 'result') {
        this.lastResult.set(event.data.result);
      } else {
        // The leader left politely: do not wait for its lease to expire.
        this.election?.tick();
      }
    };
    this.channel?.addEventListener('message', onMessage);

    const job = win.setInterval(() => void this.runJob(), JOB_INTERVAL_MS);
    // `pagehide`, not `beforeunload` or `unload`: it fires on every way a tab
    // goes away - including into the back/forward cache - and does not
    // disable that cache the way an `unload` listener does.
    const onPageHide = (): void => this.leave();
    win.addEventListener('pagehide', onPageHide);

    inject(DestroyRef).onDestroy(() => {
      win.clearInterval(job);
      win.removeEventListener('pagehide', onPageHide);
      this.leave();
      this.channel?.removeEventListener('message', onMessage);
      this.channel?.close();
    });

    this.election.start();
  }

  protected freeze(): void {
    this.frozen.set(true);
    this.election?.pause();
  }

  protected resume(): void {
    this.frozen.set(false);
    this.election?.resume();
  }

  private observe(role: Role, lease: Lease | null): void {
    if (role !== this.role()) {
      this.log.update((log) => [...log, { role, at: now() }]);
      if (role === 'leader') {
        void this.runJob();
      }
    }
    this.role.set(role);
    this.lease.set(lease);
  }

  /**
   * The shared job. Checked against the lease immediately before running,
   * not only when leadership was won: a tab that was frozen may still think it
   * leads. That narrows the double-run window; it does not close it.
   */
  private async runJob(): Promise<void> {
    if (this.frozen() || !this.election?.holdsLease()) {
      return;
    }
    this.jobsRunHere.update((count) => count + 1);
    try {
      const health = await firstValueFrom(this.health.check());
      const result: JobResult = { customers: health.customers, producedBy: this.tabId, at: now() };
      this.lastResult.set(result);
      this.channel?.postMessage({ kind: 'result', result } satisfies LeaderMessage);
    } catch {
      // A failed poll is simply not announced; the next one may succeed.
    }
  }

  private leave(): void {
    const wasLeader = this.election?.role === 'leader';
    this.election?.resign();
    if (wasLeader) {
      this.channel?.postMessage({ kind: 'resigned', from: this.tabId } satisfies LeaderMessage);
    }
  }
}
