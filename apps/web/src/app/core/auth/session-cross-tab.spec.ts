import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TAB_CHANNEL_NAME } from '../cross-tab/tab-channel';
import { FakeBroadcastNetwork } from '../testing/broadcast-testing';
import { provideSignedInAs } from '../testing/session-testing';
import { provideSessionCrossTab, SESSION_TOPIC } from './session-cross-tab';
import { SessionService, type SessionEndReason } from './session.service';

describe('provideSessionCrossTab', () => {
  let network: FakeBroadcastNetwork;
  let session: SessionService;
  let otherTab: BroadcastChannel;
  let sent: unknown[];

  beforeEach(() => {
    network = new FakeBroadcastNetwork();
    TestBed.configureTestingModule({
      providers: [network.provide(), provideSignedInAs('manager'), provideSessionCrossTab()],
    });
    session = TestBed.inject(SessionService);
    otherTab = network.channel(TAB_CHANNEL_NAME);
    sent = [];
    otherTab.addEventListener('message', (event) => sent.push(event.data));
  });

  it('tells the other tabs when the user signs out here', async () => {
    await firstValueFrom(session.signOut());

    expect(sent).toEqual([{ topic: SESSION_TOPIC, payload: { event: 'signed-out' } }]);
  });

  it('does not announce an expiry - this tab may simply have lost a race', async () => {
    await firstValueFrom(session.refresh()).catch(() => undefined);

    expect(session.status()).toBe('anonymous');
    expect(sent).toEqual([]);
  });

  it('ends the session here when another tab signs out, and does not echo it', () => {
    const ended: SessionEndReason[] = [];
    session.ended$.subscribe((reason) => ended.push(reason));

    otherTab.postMessage({ topic: SESSION_TOPIC, payload: { event: 'signed-out' } });

    expect(session.status()).toBe('anonymous');
    expect(ended).toEqual(['signed-out-elsewhere']);
    expect(sent).toEqual([]);
  });

  it('ignores a payload it does not recognise', () => {
    otherTab.postMessage({ topic: SESSION_TOPIC, payload: { event: 'reboot' } });

    expect(session.status()).toBe('authenticated');
  });
});
