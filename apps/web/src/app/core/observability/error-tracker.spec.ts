import { TestBed } from '@angular/core/testing';
import { appError } from '../errors/app-error';
import { Logger } from '../logging/logger';
import { SilentLogger } from '../testing/http-testing';
import { ErrorTracker } from './error-tracker';
import { Telemetry } from './telemetry';

describe('ErrorTracker', () => {
  let log: SilentLogger;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: Logger, useClass: SilentLogger }] });
    log = TestBed.inject(Logger) as SilentLogger;
  });

  function errors() {
    return log.entries.filter((entry) => entry.level === 'error');
  }

  it('reports an error with the steps that led to it', () => {
    const tracker = TestBed.inject(ErrorTracker);
    TestBed.inject(Telemetry).track({ name: 'customer.created' });
    tracker.addBreadcrumb({ category: 'navigation', message: '/customers/:id' });

    tracker.captureError(new TypeError('x is undefined'));

    const [report] = errors();
    expect(report?.message).toBe('Unhandled error');
    const breadcrumbs = report?.fields?.['breadcrumbs'] as { message: string }[];
    expect(breadcrumbs.map((crumb) => crumb.message)).toEqual([
      'customer.created',
      '/customers/:id',
    ]);
    expect(String(report?.fields?.['fingerprint'])).toContain('TypeError');
  });

  it('keeps the taxonomy of an already classified error, and its correlation id', () => {
    const error = appError('server', { correlationId: 'cid-1' });

    TestBed.inject(ErrorTracker).captureError(error);

    expect(errors()[0]?.fields).toMatchObject({ kind: 'server', correlationId: 'cid-1' });
  });

  it('counts a repeat of the same error instead of reporting it again', () => {
    const tracker = TestBed.inject(ErrorTracker);
    const loop = () => new Error('in a change-detection loop');
    const first = loop();

    tracker.captureError(first);
    for (let i = 0; i < 50; i++) {
      // Same name and same first stack frame: one defect.
      const repeat = new Error(first.message);
      repeat.stack = first.stack;
      tracker.captureError(repeat);
    }
    tracker.captureError(new RangeError('a different defect'));

    expect(errors()).toHaveLength(2);
  });

  it('remembers only the latest steps', () => {
    const tracker = TestBed.inject(ErrorTracker);
    for (let i = 0; i < 30; i++) {
      tracker.addBreadcrumb({ category: 'interaction', message: `step ${i}` });
    }

    tracker.captureError('a thrown string');

    const breadcrumbs = errors()[0]?.fields?.['breadcrumbs'] as { message: string }[];
    expect(breadcrumbs).toHaveLength(20);
    expect(breadcrumbs.at(-1)?.message).toBe('step 29');
  });
});
