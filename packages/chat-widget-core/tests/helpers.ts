import { vi } from "vitest";

type Listener = (e: { data?: string }) => void;

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
}

export function installFakeEventSource() {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
}

export interface RouteTable {
  [key: string]: (init?: RequestInit) => unknown;
}

/**
 * Installs a fetch mock routed by "<METHOD> <pathname>". Throws on
 * unrouted requests so tests fail loudly on unexpected calls.
 */
export function installFakeFetch(routes: RouteTable) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = new URL(url).pathname;
    const handler = routes[`${method} ${pathname}`];
    if (!handler) {
      throw new Error(`unrouted fetch: ${method} ${url}`);
    }
    const body = handler(init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  });
  vi.stubGlobal("fetch", mock);
  return { mock, calls };
}

export function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
