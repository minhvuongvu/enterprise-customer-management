import type { KeyValueStorage } from '../../core/platform/platform.tokens';

/** How long a claim lasts without renewal. Three missed heartbeats. */
export const LEASE_MS = 3_000;
/** How often every tab looks at the lease, and the leader renews it. */
export const HEARTBEAT_MS = 1_000;
/** How long a claimant waits before re-reading, to see whether its claim survived. */
export const SETTLE_MS = 150;
/** The lease record's key in localStorage. */
export const LEASE_KEY = 'ecm.lab.leader.lease';

export interface Lease {
  readonly holder: string;
  /** Epoch milliseconds. Compared across tabs, which share one clock. */
  readonly expiresAt: number;
}

export type Role = 'follower' | 'claiming' | 'leader';

/** What the election needs from the browser, so a test can supply fakes. */
export interface ElectionEnvironment {
  readonly storage: KeyValueStorage;
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly setInterval: (callback: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

export function parseLease(raw: string | null): Lease | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<Lease>;
    return typeof value.holder === 'string' && typeof value.expiresAt === 'number'
      ? { holder: value.holder, expiresAt: value.expiresAt }
      : null;
  } catch {
    return null;
  }
}

/**
 * Leader election between tabs, by lease (docs/cross-tab.md, "Leader election").
 *
 * **A learning experiment, not a distributed lock.** It shows the moving
 * parts and, more usefully, where they break.
 *
 * ## The algorithm
 *
 * One record in `localStorage` - `{ holder, expiresAt }` - is the lease.
 * Every tab runs the same heartbeat, every {@link HEARTBEAT_MS}:
 *
 *  1. **Leader**: if the record still names it, extend `expiresAt`. If it
 *     names someone else, it lost the lease while it was not looking - step
 *     down.
 *  2. **Follower**: if the record is missing or expired, **claim** it: write
 *     its own id, wait {@link SETTLE_MS}, and read it back. If its id
 *     survived, it leads; if another tab's write landed after it, it does
 *     not.
 *
 * A leader that leaves politely (`resign`) deletes the record, so a follower
 * takes over on its next heartbeat rather than after the lease expires.
 *
 * ## Why it is not a lock
 *
 * `localStorage` has no compare-and-set. Two tabs that both see an expired
 * lease both write; the settle-and-reread picks the last writer, but only if
 * both re-reads happen after both writes. A tab paused between its write and
 * its re-read - a busy main thread, a background timer delayed - can read its
 * own id after the other tab has already confirmed itself. For a moment
 * there are two leaders. The job it runs must therefore be safe to run twice.
 *
 * `navigator.locks` (the Web Locks API) is the tool that does not have this
 * race, and the session refresh uses it for exactly that reason (ADR-0027).
 * This lab keeps the lease on purpose: it is the algorithm that makes the
 * failure modes visible.
 */
export class LeaseElection {
  private roleValue: Role = 'follower';
  private heartbeat: unknown = null;
  private paused = false;

  constructor(
    private readonly tabId: string,
    private readonly environment: ElectionEnvironment,
    private readonly onChange: (role: Role, lease: Lease | null) => void,
  ) {}

  get role(): Role {
    return this.roleValue;
  }

  start(): void {
    this.tick();
    this.heartbeat = this.environment.setInterval(() => this.tick(), HEARTBEAT_MS);
  }

  /** Stops, and hands the lease back if it held it. */
  resign(): void {
    if (this.heartbeat !== null) {
      this.environment.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.currentLease()?.holder === this.tabId) {
      this.environment.storage.remove(LEASE_KEY);
    }
    this.setRole('follower');
  }

  /**
   * Stops renewing *without* resigning - what a frozen or heavily throttled
   * tab looks like from outside. The lease expires; another tab takes over.
   */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.tick();
  }

  /** Runs one heartbeat now - when another tab announces it resigned. */
  tick(): void {
    if (this.paused || this.roleValue === 'claiming') {
      return;
    }
    const lease = this.currentLease();
    const now = this.environment.now();

    if (this.roleValue === 'leader') {
      if (lease?.holder === this.tabId) {
        this.write({ holder: this.tabId, expiresAt: now + LEASE_MS });
        this.onChange('leader', this.currentLease());
      } else {
        // Someone else holds it: this tab's lease expired while it was not
        // renewing - paused, frozen, or throttled in the background.
        this.setRole('follower');
      }
      return;
    }

    if (!lease || lease.expiresAt <= now) {
      this.claim(now);
    } else {
      this.onChange(this.roleValue, lease);
    }
  }

  /** Whether this tab may act as leader right now: it leads, and the record agrees. */
  holdsLease(): boolean {
    const lease = this.currentLease();
    return (
      this.roleValue === 'leader' &&
      lease?.holder === this.tabId &&
      lease.expiresAt > this.environment.now()
    );
  }

  private claim(now: number): void {
    this.setRole('claiming');
    this.write({ holder: this.tabId, expiresAt: now + LEASE_MS });
    this.environment.setTimeout(() => {
      const survived = this.currentLease()?.holder === this.tabId;
      this.setRole(survived ? 'leader' : 'follower');
    }, SETTLE_MS);
  }

  private setRole(role: Role): void {
    this.roleValue = role;
    this.onChange(role, this.currentLease());
  }

  private currentLease(): Lease | null {
    return parseLease(this.environment.storage.read(LEASE_KEY));
  }

  private write(lease: Lease): void {
    this.environment.storage.write(LEASE_KEY, JSON.stringify(lease));
  }
}
