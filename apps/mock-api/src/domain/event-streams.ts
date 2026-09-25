/**
 * The open event streams, so the admin routes can end them on demand.
 *
 * Exists for one reason: a reconnect has to be *tested*, and waiting for a
 * real network to drop is not a test. Ending a stream from the server side is
 * exactly what a proxy timeout or a deploy looks like to a browser.
 *
 * Each stream is registered under its session's CSRF token - the one value
 * that identifies a signed-in browser and survives refresh-token rotation - so
 * a test can drop *its own* streams without dropping every other test's that
 * happens to run at the same moment.
 */
export class EventStreams {
  private readonly closers = new Map<() => void, string>();

  /** Registers a stream's closer; returns the function that unregisters it. */
  register(close: () => void, sessionKey: string): () => void {
    this.closers.set(close, sessionKey);
    return () => this.closers.delete(close);
  }

  get size(): number {
    return this.closers.size;
  }

  /** Ends the streams of one session, or every stream. Returns how many. */
  close(sessionKey?: string): number {
    const chosen = [...this.closers].filter(([, key]) => !sessionKey || key === sessionKey);
    for (const [close] of chosen) {
      close();
    }
    return chosen.length;
  }
}
