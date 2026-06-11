import { afterEach, describe, expect, it, vi } from "vitest";
import { Transport } from "../src/transport";
import {
  FakeEventSource,
  installFakeEventSource,
  installFakeFetch,
} from "./helpers";

const TOKEN = "11111111-2222-3333-4444-555555555555";

function makeTransport(baseUrl = "https://chat.example.com") {
  return new Transport({
    baseUrl,
    widgetToken: TOKEN,
    widgetUserId: "visitor-1",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Transport URLs and headers", () => {
  it("builds API URLs from baseUrl + token", async () => {
    const { calls } = installFakeFetch({
      [`GET /api/widget/v1/${TOKEN}/config`]: () => ({ widget: {}, assistant: {} }),
    });
    await makeTransport().fetchConfig();
    expect(calls[0].url).toBe(
      `https://chat.example.com/api/widget/v1/${TOKEN}/config`,
    );
  });

  it("strips trailing slashes from baseUrl", async () => {
    const { calls } = installFakeFetch({
      [`GET /api/widget/v1/${TOKEN}/threads`]: () => [],
    });
    await makeTransport("https://chat.example.com///").listThreads();
    expect(calls[0].url).toBe(
      `https://chat.example.com/api/widget/v1/${TOKEN}/threads`,
    );
  });

  it("sends the x-widget-user-id header and updates it via setWidgetUserId", async () => {
    const { calls } = installFakeFetch({
      [`GET /api/widget/v1/${TOKEN}/threads`]: () => [],
    });
    const t = makeTransport();
    await t.listThreads();
    expect(
      (calls[0].init?.headers as Record<string, string>)["x-widget-user-id"],
    ).toBe("visitor-1");

    t.setWidgetUserId("visitor-2");
    await t.listThreads();
    expect(
      (calls[1].init?.headers as Record<string, string>)["x-widget-user-id"],
    ).toBe("visitor-2");
  });

  it("throws on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })),
    );
    await expect(makeTransport().fetchConfig()).rejects.toThrow(
      "config fetch failed: 403",
    );
  });
});

describe("Transport.streamMessage", () => {
  it("streams chunks and treats complete as terminal (done is a backup)", () => {
    installFakeEventSource();
    const chunks: string[] = [];
    let completed: unknown = undefined;
    let doneCount = 0;

    makeTransport().streamMessage("msg-1", {
      onChunk: (c) => chunks.push(c),
      onComplete: (m) => (completed = m),
      onDone: () => doneCount++,
    });

    const es = FakeEventSource.last()!;
    expect(es.url).toBe(
      `https://chat.example.com/api/widget/v1/${TOKEN}/messages/msg-1/stream`,
    );
    es.dispatch("message", "Hel");
    es.dispatch("message", "lo");
    es.dispatch(
      "complete",
      JSON.stringify({ id: "msg-1", content: "Hello" }),
    );
    es.dispatch("done", "end");

    expect(chunks).toEqual(["Hel", "lo"]);
    expect((completed as { content: string }).content).toBe("Hello");
    expect(doneCount).toBe(1);
    expect(es.closed).toBe(true);
  });

  it("passes null to onComplete when the payload is not JSON", () => {
    installFakeEventSource();
    let completed: unknown = "sentinel";
    makeTransport().streamMessage("msg-1", {
      onComplete: (m) => (completed = m),
    });
    FakeEventSource.last()!.dispatch("complete", "not-json");
    expect(completed).toBeNull();
  });

  it("reports explicit error frames and closes", () => {
    installFakeEventSource();
    let error: string | null = null;
    makeTransport().streamMessage("msg-1", {
      onError: (e) => (error = e),
    });
    const es = FakeEventSource.last()!;
    es.dispatch("error", "model exploded");
    expect(error).toBe("model exploded");
    expect(es.closed).toBe(true);
  });

  it("reports connection loss when the source is closed without data", () => {
    installFakeEventSource();
    let error: string | null = null;
    makeTransport().streamMessage("msg-1", {
      onError: (e) => (error = e),
    });
    const es = FakeEventSource.last()!;
    es.readyState = FakeEventSource.CLOSED;
    es.dispatch("error");
    expect(error).toBe("connection closed");
  });

  it("returns a teardown function that closes the source", () => {
    installFakeEventSource();
    const close = makeTransport().streamMessage("msg-1", {});
    const es = FakeEventSource.last()!;
    expect(es.closed).toBe(false);
    close();
    expect(es.closed).toBe(true);
  });
});
