import type { Provider } from '@angular/core';
import { BROADCAST_CHANNEL_FACTORY } from '../platform/platform.tokens';

/**
 * An in-memory stand-in for the browser's `BroadcastChannel`, for tests.
 *
 * Test-only. Nothing in the application imports this file.
 *
 * It keeps the one property everything cross-tab relies on: a message goes to
 * every *other* open channel of the same name, never back to its sender.
 * Delivery is synchronous, so a test can post and assert on the next line;
 * the real channel delivers on a later task, which is what the E2E suite
 * (e2e/cross-tab.spec.ts) exercises.
 */
export class FakeBroadcastNetwork {
  private readonly open = new Set<FakeBroadcastChannel>();

  /** Provides the application's factory, backed by this network. */
  provide(): Provider {
    return { provide: BROADCAST_CHANNEL_FACTORY, useValue: (name: string) => this.channel(name) };
  }

  /** A channel as another tab would open it. */
  channel(name: string): BroadcastChannel {
    const channel = new FakeBroadcastChannel(name, this);
    this.open.add(channel);
    return channel as unknown as BroadcastChannel;
  }

  deliver(from: FakeBroadcastChannel, data: unknown): void {
    for (const channel of this.open) {
      if (channel !== from && channel.name === from.name) {
        channel.receive(data);
      }
    }
  }

  forget(channel: FakeBroadcastChannel): void {
    this.open.delete(channel);
  }
}

class FakeBroadcastChannel {
  private readonly listeners = new Set<(event: MessageEvent) => void>();

  constructor(
    readonly name: string,
    private readonly network: FakeBroadcastNetwork,
  ) {}

  postMessage(data: unknown): void {
    // A structured clone, as the browser makes: the receiver never shares
    // an object with the sender.
    this.network.deliver(this, structuredClone(data));
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.network.forget(this);
  }

  receive(data: unknown): void {
    for (const listener of this.listeners) {
      listener(new MessageEvent('message', { data }));
    }
  }
}
