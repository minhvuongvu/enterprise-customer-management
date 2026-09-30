import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppConfigStore } from './app-config';
import { featureEnabled } from './feature-flag.guard';

@Component({ selector: 'app-flagged', template: 'flagged page' })
class FlaggedPage {}

@Component({ selector: 'app-fallback', template: 'not found' })
class Fallback {}

describe('featureEnabled', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'import', canMatch: [featureEnabled('customerImport')], component: FlaggedPage },
          { path: '**', component: Fallback },
        ]),
      ],
    });
  });

  it('lets the route match while the flag is on', async () => {
    const harness = await RouterTestingHarness.create('/import');

    expect(harness.routeNativeElement?.textContent).toBe('flagged page');
  });

  it('makes the route not exist while the flag is off - the wildcard answers', async () => {
    TestBed.inject(AppConfigStore).apply({ features: { customerImport: false } });

    const harness = await RouterTestingHarness.create('/import');

    expect(harness.routeNativeElement?.textContent).toBe('not found');
    expect(TestBed.inject(Router).url).toBe('/import');
  });
});
