import { vi } from "vitest";

const RESPONSE_SPEC = Symbol("urai.fake-response");

export interface FakeResponseSpec {
  [RESPONSE_SPEC]: true;
  status: number;
  body?: unknown;
  text?: string;
  blob?: Blob;
  headers?: Record<string, string>;
}

/**
 * Describe a non-default response. A handler that returns a plain value
 * still means "200, this as JSON", so existing route tables are
 * unaffected; reach for `respond` when a test needs a status, a text
 * body, a blob, or headers.
 *
 * The symbol brand matters: without it a legitimate JSON body that
 * happened to have a `status` key would be misread as a spec.
 */
export function respond(
  spec: Omit<FakeResponseSpec, typeof RESPONSE_SPEC | "status"> & { status?: number },
): FakeResponseSpec {
  return { [RESPONSE_SPEC]: true, status: spec.status ?? 200, ...spec };
}

function isSpec(v: unknown): v is FakeResponseSpec {
  return typeof v === "object" && v !== null && RESPONSE_SPEC in v;
}

export interface RouteTable {
  [key: string]: (init?: RequestInit) => unknown;
}

export interface FakeFetchCall {
  url: string;
  init?: RequestInit;
  method: string;
  pathname: string;
}

/**
 * Installs a fetch mock routed by "<METHOD> <pathname>". Throws on
 * unrouted requests so tests fail loudly on unexpected calls.
 *
 * The returned response implements enough of `Response` for the
 * transport's real code paths: `json()`, `text()`, `blob()`, `ok`,
 * `status` and `headers`. `ok` is derived from the status, so error
 * branches are reachable.
 */
export function installFakeFetch(routes: RouteTable) {
  const calls: FakeFetchCall[] = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = new URL(url).pathname;
    calls.push({ url, init, method, pathname });
    const handler = routes[`${method} ${pathname}`];
    if (!handler) {
      throw new Error(`unrouted fetch: ${method} ${url}`);
    }
    const result = handler(init);
    const spec: FakeResponseSpec = isSpec(result)
      ? result
      : { [RESPONSE_SPEC]: true, status: 200, body: result };

    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      headers: new Headers(spec.headers ?? {}),
      json: async () => spec.body,
      text: async () =>
        spec.text ?? (spec.body === undefined ? "" : JSON.stringify(spec.body)),
      blob: async () => spec.blob ?? new Blob([]),
    };
  });
  vi.stubGlobal("fetch", mock);
  return {
    mock,
    calls,
    /** Calls matching "<METHOD> <pathname>", in order. */
    callsFor(key: string) {
      return calls.filter((c) => `${c.method} ${c.pathname}` === key);
    },
  };
}

export function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
