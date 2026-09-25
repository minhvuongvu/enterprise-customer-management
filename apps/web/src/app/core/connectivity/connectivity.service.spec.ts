import { TestBed } from '@angular/core/testing';
import { NAVIGATOR, WINDOW } from '../platform/platform.tokens';
import { ConnectivityService } from './connectivity.service';

describe('ConnectivityService', () => {
  function create(onLine: boolean): { service: ConnectivityService; win: EventTarget } {
    const win = new EventTarget();
    TestBed.configureTestingModule({
      providers: [
        { provide: WINDOW, useValue: win },
        { provide: NAVIGATOR, useValue: { onLine } },
      ],
    });
    return { service: TestBed.inject(ConnectivityService), win };
  }

  it('starts from what the browser reports', () => {
    expect(create(false).service.online()).toBe(false);
  });

  it('follows the offline and online events, and announces only a return', () => {
    const { service, win } = create(true);
    let reconnections = 0;
    service.reconnected$.subscribe(() => reconnections++);

    // Online while already online is not a reconnection.
    win.dispatchEvent(new Event('online'));
    expect(reconnections).toBe(0);

    win.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);

    win.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
    expect(reconnections).toBe(1);
  });

  it('assumes online on the server', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: WINDOW, useValue: null },
        { provide: NAVIGATOR, useValue: null },
      ],
    });
    expect(TestBed.inject(ConnectivityService).online()).toBe(true);
  });

  it('stops listening when destroyed', () => {
    const { service, win } = create(true);
    TestBed.resetTestingModule();

    win.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(true);
  });
});
