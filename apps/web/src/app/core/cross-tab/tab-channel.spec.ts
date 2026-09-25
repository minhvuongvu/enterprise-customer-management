import { TestBed } from '@angular/core/testing';
import { BROADCAST_CHANNEL_FACTORY } from '../platform/platform.tokens';
import { FakeBroadcastNetwork } from '../testing/broadcast-testing';
import { TAB_CHANNEL_NAME, TabChannel } from './tab-channel';

describe('TabChannel', () => {
  let network: FakeBroadcastNetwork;
  let channel: TabChannel;

  beforeEach(() => {
    network = new FakeBroadcastNetwork();
    TestBed.configureTestingModule({ providers: [network.provide()] });
    channel = TestBed.inject(TabChannel);
  });

  it('posts a topic and payload to the other tabs', () => {
    const otherTab = network.channel(TAB_CHANNEL_NAME);
    const received: unknown[] = [];
    otherTab.addEventListener('message', (event) => received.push(event.data));

    channel.post('customers', { change: 'many' });

    expect(received).toEqual([{ topic: 'customers', payload: { change: 'many' } }]);
  });

  it('hands each owner only its own topic', () => {
    const session: unknown[] = [];
    const customers: unknown[] = [];
    channel.on('session').subscribe((payload) => session.push(payload));
    channel.on('customers').subscribe((payload) => customers.push(payload));

    const otherTab = network.channel(TAB_CHANNEL_NAME);
    otherTab.postMessage({ topic: 'session', payload: { event: 'signed-out' } });

    expect(session).toEqual([{ event: 'signed-out' }]);
    expect(customers).toEqual([]);
  });

  it('never hears its own posts', () => {
    const heard: unknown[] = [];
    channel.on('customers').subscribe((payload) => heard.push(payload));

    channel.post('customers', { change: 'many' });

    expect(heard).toEqual([]);
  });

  it('drops what is not an envelope - another build may be on the channel', () => {
    const heard: unknown[] = [];
    channel.on('customers').subscribe((payload) => heard.push(payload));

    const otherTab = network.channel(TAB_CHANNEL_NAME);
    otherTab.postMessage('customers changed');
    otherTab.postMessage({ payload: {} });

    expect(heard).toEqual([]);
  });

  it('closes its channel with the injector', () => {
    const heard: unknown[] = [];
    channel.on('x').subscribe((payload) => heard.push(payload));
    const otherTab = network.channel(TAB_CHANNEL_NAME);

    TestBed.resetTestingModule();
    otherTab.postMessage({ topic: 'x', payload: 1 });

    expect(heard).toEqual([]);
  });

  it('does nothing, without failing, where there is no BroadcastChannel', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: BROADCAST_CHANNEL_FACTORY, useValue: () => null }],
    });
    const serverSide = TestBed.inject(TabChannel);

    expect(() => serverSide.post('session', {})).not.toThrow();
  });
});
