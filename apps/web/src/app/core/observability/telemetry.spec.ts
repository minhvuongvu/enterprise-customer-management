import { TestBed } from '@angular/core/testing';
import { Logger } from '../logging/logger';
import { SilentLogger } from '../testing/http-testing';
import { Telemetry } from './telemetry';

describe('Telemetry', () => {
  it('logs a named interaction with its non-identifying facts', () => {
    TestBed.configureTestingModule({ providers: [{ provide: Logger, useClass: SilentLogger }] });

    TestBed.inject(Telemetry).track({ name: 'customers.imported', imported: 2, skipped: 1 });

    const log = TestBed.inject(Logger) as SilentLogger;
    expect(log.entries).toEqual([
      {
        level: 'info',
        message: 'User interaction',
        fields: { event: 'customers.imported', imported: 2, skipped: 1 },
      },
    ]);
  });
});
