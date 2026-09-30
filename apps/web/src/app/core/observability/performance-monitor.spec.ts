import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Component } from '@angular/core';
import { Logger } from '../logging/logger';
import { SilentLogger } from '../testing/http-testing';
import { PerformanceMonitor, summarise } from './performance-monitor';
import { PERFORMANCE_BUDGETS } from './performance-budgets';

@Component({ selector: 'app-blank', template: '' })
class Blank {}

describe('PerformanceMonitor', () => {
  let log: SilentLogger;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Logger, useClass: SilentLogger },
        provideRouter([
          { path: '', component: Blank },
          { path: 'customers/:id/edit', component: Blank },
        ]),
      ],
    });
    log = TestBed.inject(Logger) as SilentLogger;
  });

  it('groups API calls by endpoint template, so ids do not split the statistics', () => {
    const monitor = TestBed.inject(PerformanceMonitor);

    monitor.recordApiCall('GET', '/api/customers/11111111-1111-4111-8111-111111111112', 40, 200);
    monitor.recordApiCall('GET', '/api/customers/22222222-2222-4222-8222-222222222223', 60, 200);
    monitor.recordApiCall('GET', '/api/customers?page=2&search=an', 10, 200);

    expect(monitor.apiLatency().map((row) => [row.endpoint, row.count])).toEqual([
      ['GET /api/customers/:id', 2],
      ['GET /api/customers', 1],
    ]);
  });

  it('logs a call inside its budget at debug, and one over it as a warning with the budget', () => {
    const monitor = TestBed.inject(PerformanceMonitor);

    monitor.recordApiCall('GET', '/api/health', 5, 200);
    monitor.recordApiCall('POST', '/api/customers/import', PERFORMANCE_BUDGETS.apiCallMs + 1, 200);

    expect(log.entries.map((entry) => [entry.level, entry.message])).toEqual([
      ['debug', 'API call'],
      ['warn', 'API call over budget'],
    ]);
    expect(log.entries[1]?.fields).toMatchObject({
      endpoint: 'POST /api/customers/import',
      budgetMs: PERFORMANCE_BUDGETS.apiCallMs,
    });
  });

  it('times route navigations by route template, not by URL', async () => {
    const monitor = TestBed.inject(PerformanceMonitor);
    monitor.start();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    await router.navigateByUrl('/customers/abc/edit');

    // The first navigation belongs to the initial load; the second is timed.
    expect(monitor.navigations().map((navigation) => navigation.route)).toEqual([
      '/customers/:id/edit',
    ]);
  });
});

describe('summarise', () => {
  it('reports nearest-rank percentiles', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(summarise('GET /x', samples)).toEqual({
      endpoint: 'GET /x',
      count: 100,
      p50Ms: 50,
      p95Ms: 95,
      maxMs: 100,
    });
  });
});
