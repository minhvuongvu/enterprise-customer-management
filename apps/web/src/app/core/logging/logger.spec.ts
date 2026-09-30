import { TestBed } from '@angular/core/testing';
import { REDACTED } from '@ecm/contracts';
import { AppConfigStore } from '../config/app-config';
import { LOG_SINKS, Logger, type LogEntry, type LogSink } from './logger';

class CapturingSink implements LogSink {
  readonly entries: LogEntry[] = [];
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

/**
 * The logger is where redaction is guaranteed: whatever a call site passes,
 * a sink receives it already cleaned (ADR-0038). These tests stand in for
 * every sink there will ever be - the console today, a collector tomorrow.
 */
describe('StructuredLogger', () => {
  let sink: CapturingSink;

  beforeEach(() => {
    sink = new CapturingSink();
    TestBed.configureTestingModule({
      providers: [{ provide: LOG_SINKS, useValue: sink, multi: true }],
    });
    TestBed.inject(AppConfigStore).apply({ logLevel: 'debug' });
  });

  function logger(): Logger {
    return TestBed.inject(Logger);
  }

  it('never lets a secret, a token or personal data reach a sink', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

    logger().error('Sign-in failed for an@example.test', {
      password: 'hunter2',
      accessToken: jwt,
      headers: { Authorization: `Bearer ${jwt}`, cookie: 'ecm_access=cookie-value-9f3k' },
      customer: { id: 'c-1', fullName: 'Nguyễn Văn A', email: 'an@example.test', phone: '+849' },
      detail: `server said: token ${jwt} rejected`,
    });

    const [entry] = sink.entries;
    const written = JSON.stringify(entry);
    // Distinctive values only: a short one like 'abc' can occur by chance in
    // the random pageViewId, and the test would fail one run in a few hundred.
    for (const secret of [
      'hunter2',
      jwt,
      'cookie-value-9f3k',
      'Nguyễn',
      'an@example.test',
      '+849',
    ]) {
      expect(written).not.toContain(secret);
    }
    expect(entry?.message).toBe('Sign-in failed for [email]');
    expect(entry?.['password']).toBe(REDACTED);
    expect((entry?.['customer'] as Record<string, unknown>)['id']).toBe('c-1');
  });

  it('adds the fields every line carries, and a caller cannot overwrite them', () => {
    logger().info('Hello', { level: 'error', service: 'spoofed', durationMs: 3 });

    const [entry] = sink.entries;
    expect(entry).toMatchObject({ level: 'info', service: 'web', message: 'Hello', durationMs: 3 });
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(entry?.pageViewId).toBeTruthy();
  });

  it("applies the deployment's log level, read when each line is written", () => {
    const config = TestBed.inject(AppConfigStore);
    config.apply({ logLevel: 'warn' });

    logger().debug('noise');
    logger().info('still noise');
    logger().warn('worth reading');
    config.apply({ logLevel: 'debug' });
    logger().debug('now visible');

    expect(sink.entries.map((entry) => entry.message)).toEqual(['worth reading', 'now visible']);
  });

  it('keeps logging to the other sinks when one of them throws', () => {
    const second = new CapturingSink();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LOG_SINKS,
          useValue: {
            write: () => {
              throw new Error('disk full');
            },
          },
          multi: true,
        },
        { provide: LOG_SINKS, useValue: second, multi: true },
      ],
    });

    expect(() => TestBed.inject(Logger).error('boom')).not.toThrow();
    expect(second.entries).toHaveLength(1);
  });

  it('is silent, not broken, where no sink is registered', () => {
    TestBed.resetTestingModule();

    expect(() => TestBed.inject(Logger).error('nobody listening')).not.toThrow();
  });
});
