import { vi } from "vitest";

type Listener = (e: { data?: string }) => void;

/**
 * Stand-in for the browser `EventSource`. Tests drive the stream by
 * hand: `FakeEventSource.last()!.dispatch("complete", json)`.
 */
export class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];

  url: string;
  readyState = FakeEventSource.OPEN;
  closed = false;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string, _opts?: unknown) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  dispatch(type: string, data?: string) {
    this.listeners.get(type)?.forEach((cb) => cb({ data }));
  }

  /**
   * Replay a scripted transcript in order. Each frame is `[type, data?]`.
   */
  dispatchAll(frames: Array<[type: string, data?: string]>) {
    for (const [type, data] of frames) this.dispatch(type, data);
  }

  /**
   * The transport distinguishes an explicit server error frame (which
   * carries string data) from the connection simply dropping (no data,
   * `readyState === CLOSED`). Both reach the same listener, so tests
   * need to be able to produce each independently.
   */
  dispatchError(opts: { data?: string } = {}) {
    if (opts.data === undefined) {
      this.readyState = FakeEventSource.CLOSED;
    }
    this.dispatch("error", opts.data);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  static last(): FakeEventSource | undefined {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  /** Streams opened but never torn down — a leak check for unmount tests. */
  static openCount(): number {
    return FakeEventSource.instances.filter((e) => !e.closed).length;
  }
}

export function installFakeEventSource() {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
}
