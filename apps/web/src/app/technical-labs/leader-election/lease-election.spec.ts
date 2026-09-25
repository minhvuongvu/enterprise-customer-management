import type { KeyValueStorage } from '../../core/platform/platform.tokens';
import {
  HEARTBEAT_MS,
  LEASE_KEY,
  LEASE_MS,
  LeaseElection,
  parseLease,
  SETTLE_MS,
  type ElectionEnvironment,
  type Role,
} from './lease-election';

/** One localStorage shared by every "tab", as the browser shares it. */
class SharedStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
}

describe('LeaseElection', () => {
  let storage: SharedStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new SharedStorage();
  });

  afterEach(() => vi.useRealTimers());

  function tab(id: string): { election: LeaseElection; roles: Role[] } {
    const environment: ElectionEnvironment = {
      storage,
      now: () => Date.now(),
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    };
    const roles: Role[] = [];
    const election = new LeaseElection(id, environment, (role) => {
      if (roles.at(-1) !== role) {
        roles.push(role);
      }
    });
    return { election, roles };
  }

  it('a lone tab claims the lease and leads once its claim has settled', () => {
    const { election } = tab('a');
    election.start();
    expect(election.role).toBe('claiming');

    vi.advanceTimersByTime(SETTLE_MS);
    expect(election.role).toBe('leader');
    expect(parseLease(storage.read(LEASE_KEY))?.holder).toBe('a');
  });

  it('a second tab follows while the lease is held and renewed', () => {
    const a = tab('a');
    a.election.start();
    vi.advanceTimersByTime(SETTLE_MS);

    const b = tab('b');
    b.election.start();
    vi.advanceTimersByTime(LEASE_MS * 5);

    expect(a.election.role).toBe('leader');
    expect(b.election.role).toBe('follower');
  });

  it('a tab that sees a fresh claim does not contest it', () => {
    const a = tab('a');
    const b = tab('b');
    a.election.start();
    b.election.start();
    vi.advanceTimersByTime(SETTLE_MS);

    expect(a.election.role).toBe('leader');
    expect(b.election.role).toBe('follower');
  });

  it('two tabs that both saw no lease both claim, and the re-read picks the last writer', () => {
    // The race: in two real tabs, both can read "no lease" before either
    // writes. One thread cannot interleave like that, so the test does it by
    // hand - a claims, and b's claim is made as if b had read before a wrote.
    const a = tab('a');
    const b = tab('b');
    a.election.start();
    storage.remove(LEASE_KEY);
    b.election.start();
    expect([a.election.role, b.election.role]).toEqual(['claiming', 'claiming']);

    vi.advanceTimersByTime(SETTLE_MS);

    expect(a.election.role).toBe('follower');
    expect(b.election.role).toBe('leader');
  });

  it('when the leader resigns, a follower takes over on its next heartbeat', () => {
    const a = tab('a');
    a.election.start();
    vi.advanceTimersByTime(SETTLE_MS);
    const b = tab('b');
    b.election.start();

    a.election.resign();
    expect(storage.read(LEASE_KEY)).toBeNull();
    vi.advanceTimersByTime(HEARTBEAT_MS + SETTLE_MS);

    expect(b.election.role).toBe('leader');
  });

  it('a frozen leader loses the lease when it expires, and steps down when it wakes', () => {
    const a = tab('a');
    a.election.start();
    vi.advanceTimersByTime(SETTLE_MS);
    const b = tab('b');
    b.election.start();

    a.election.pause();
    vi.advanceTimersByTime(LEASE_MS + HEARTBEAT_MS + SETTLE_MS);
    expect(b.election.role).toBe('leader');
    // Still believes it leads - it has not looked. This is the double-leader window.
    expect(a.election.role).toBe('leader');
    // ...but the lease no longer agrees, which is what the job checks first.
    expect(a.election.holdsLease()).toBe(false);

    a.election.resume();
    expect(a.election.role).toBe('follower');
    expect(a.roles).toEqual(['claiming', 'leader', 'follower']);
  });

  it('reads a corrupt or foreign lease record as no lease', () => {
    expect(parseLease('not json')).toBeNull();
    expect(parseLease('{"holder": 3}')).toBeNull();
    expect(parseLease(null)).toBeNull();
    expect(parseLease('{"holder":"a","expiresAt":5}')).toEqual({ holder: 'a', expiresAt: 5 });
  });
});
