import { TestBed } from '@angular/core/testing';
import type { Route } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { AppConfigStore } from '../config/app-config';
import { NAVIGATOR } from '../platform/platform.tokens';
import { FlaggedPreloading } from './flagged-preloading';
import { withMetadata } from './route-metadata';

describe('FlaggedPreloading', () => {
  const flagged: Route = { path: 'customers', data: withMetadata({ preload: true }) };
  const unflagged: Route = { path: 'technical-labs' };

  function strategy(navigator: object = {}): FlaggedPreloading {
    TestBed.configureTestingModule({ providers: [{ provide: NAVIGATOR, useValue: navigator }] });
    return TestBed.inject(FlaggedPreloading);
  }

  async function preloads(subject: FlaggedPreloading, route: Route): Promise<boolean> {
    let loaded = false;
    await firstValueFrom(
      subject.preload(route, () => {
        loaded = true;
        return of(null);
      }),
      { defaultValue: null },
    );
    return loaded;
  }

  it('preloads a route that asks for it, and no other', async () => {
    const subject = strategy();
    expect(await preloads(subject, flagged)).toBe(true);
    expect(await preloads(subject, unflagged)).toBe(false);
  });

  it('preloads nothing when the runtime flag is off', async () => {
    const subject = strategy();
    TestBed.inject(AppConfigStore).apply({ features: { routePreloading: false } });
    expect(await preloads(subject, flagged)).toBe(false);
  });

  it('preloads nothing when the user asked the browser to save data', async () => {
    const subject = strategy({ connection: { saveData: true } });
    expect(await preloads(subject, flagged)).toBe(false);
  });
});
