import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('starts in "unknown", not "anonymous"', () => {
    TestBed.configureTestingModule({});
    const session = TestBed.inject(SessionService);

    // The distinction matters: treating "not checked yet" as "signed out"
    // bounces a signed-in user to the login page on every reload. Phase 3
    // depends on this state existing.
    expect(session.status()).toBe('unknown');
    expect(session.isAuthenticated()).toBe(false);
    expect(session.user()).toBeNull();
  });
});
