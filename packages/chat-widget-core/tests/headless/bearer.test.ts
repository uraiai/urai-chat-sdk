// Member hosts: Urai's own add-ons on `/api/client/v1` with a bearer session.
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeFetch, makeFakeTransport, respond } from "@uraiai/chat-test-support";
import { Transport } from "../../src/transport";
import { createChatClient } from "../../src/headless/client";
import { createChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";

const BASE = "https://chat.example.com";
const AGENT = "agent-1";

function bearerTransport(extra: Partial<ConstructorParameters<typeof Transport>[0]["bearer"]> = {}) {
  return new Transport({
    baseUrl: BASE,
    bearer: { agentId: AGENT, getToken: () => "tok-1", ...extra },
  });
}

const headers = (init?: RequestInit) => init?.headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Transport with bearer auth", () => {
  it("talks to /api/client/v1, naming the agent for config and threads", async () => {
    const { calls } = installFakeFetch({
      [`GET /api/client/v1/agents/${AGENT}/config`]: () => ({ widget: {}, assistant: {} }),
      [`GET /api/client/v1/agents/${AGENT}/threads`]: () => [],
      "GET /api/client/v1/threads/t1/messages": () => [],
    });
    const t = bearerTransport();
    await t.fetchConfig();
    await t.listThreads();
    await t.listMessages("t1");
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/client/v1/agents/${AGENT}/config`,
      `${BASE}/api/client/v1/agents/${AGENT}/threads`,
      `${BASE}/api/client/v1/threads/t1/messages`,
    ]);
    for (const c of calls) {
      expect(headers(c.init).authorization).toBe("Bearer tok-1");
      expect(headers(c.init)["x-widget-user-id"]).toBeUndefined();
    }
  });

  it("attaches new threads to the thread ref and filters the list by it", async () => {
    const { calls } = installFakeFetch({
      [`GET /api/client/v1/agents/${AGENT}/threads`]: () => [],
      [`POST /api/client/v1/agents/${AGENT}/threads`]: () => ({ thread_id: "t1", created: true }),
    });
    let doc = { ref: "doc-1", title: "Q4 plan" };
    const t = bearerTransport({ threadRef: () => doc });
    await t.listThreads();
    await t.createOrResumeThread({ force_new: true });
    expect(calls[0].url).toBe(`${BASE}/api/client/v1/agents/${AGENT}/threads?ref=doc-1`);
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({
      force_new: true,
      ref: "doc-1",
      ref_title: "Q4 plan",
    });

    // Read per call: switching documents needs no new transport.
    doc = { ref: "doc 2", title: "Notes" };
    await t.listThreads();
    expect(calls[2].url).toBe(`${BASE}/api/client/v1/agents/${AGENT}/threads?ref=doc%202`);
  });

  it("retries a 401 once with a refreshed token, then gives up", async () => {
    let seen: string[] = [];
    installFakeFetch({
      [`GET /api/client/v1/agents/${AGENT}/threads`]: (init) => {
        const auth = headers(init).authorization;
        seen.push(auth);
        return auth === "Bearer tok-2" ? [] : respond({ status: 401 });
      },
    });
    const refreshToken = vi.fn(async () => "tok-2");
    await bearerTransport({ refreshToken }).listThreads();
    expect(seen).toEqual(["Bearer tok-1", "Bearer tok-2"]);
    expect(refreshToken).toHaveBeenCalledOnce();

    seen = [];
    const refuse = vi.fn(async () => null);
    await expect(bearerTransport({ refreshToken: refuse }).listThreads()).rejects.toThrow("401");
    expect(seen).toEqual(["Bearer tok-1"]);
  });

  it("sends uploads without a content type, still with the token", async () => {
    const { calls } = installFakeFetch({
      "POST /api/client/v1/attachments/upload": () => ({
        file_name: "a.txt",
        mime_type: "text/plain",
        bucket_path: "client_uploads/u/x/a.txt",
      }),
    });
    await bearerTransport().uploadAttachment(new File(["hi"], "a.txt"));
    expect(headers(calls[0].init)["content-type"]).toBeUndefined();
    expect(headers(calls[0].init).authorization).toBe("Bearer tok-1");
  });

  it("can stop a turn; a 304 (nothing running) is not an error", async () => {
    const { calls } = installFakeFetch({
      "POST /api/client/v1/threads/t1/stop": () => respond({ status: 304 }),
    });
    const t = bearerTransport();
    expect(t.stopTurn).toBeTypeOf("function");
    await t.stopTurn!("t1");
    expect(calls[0].url).toBe(`${BASE}/api/client/v1/threads/t1/stop`);
  });

  it("a widget transport has no stop and keeps its old requests", async () => {
    const { calls } = installFakeFetch({
      "GET /api/widget/v1/tok/threads": () => [],
    });
    const t = new Transport({ baseUrl: BASE, widgetToken: "tok", widgetUserId: "v1" });
    expect(t.stopTurn).toBeUndefined();
    await t.listThreads();
    expect(headers(calls[0].init)).toEqual({
      "content-type": "application/json",
      "x-widget-user-id": "v1",
    });
  });
});

describe("createChatClient with bearer auth", () => {
  it("needs no widget token or user id", async () => {
    installFakeFetch({
      [`GET /api/client/v1/agents/${AGENT}/config`]: () => ({
        widget: { id: AGENT, name: "Doc agent", theme: {}, layout: {}, behavior: {} },
        assistant: { id: AGENT, name: "Doc agent", description: null },
      }),
    });
    const client = createChatClient({
      baseUrl: BASE,
      bearer: { agentId: AGENT, getToken: () => "tok-1" },
    });
    await client.ready;
    expect(client.store.getState().canStop).toBe(true);
    client.destroy();
  });

  it("still requires a widget token without bearer auth", () => {
    expect(() => createChatClient({ userId: "v1" })).toThrow("widgetToken is required");
  });
});

describe("store.stopTurn", () => {
  function storeWith(stop?: (threadId: string) => Promise<void>) {
    const transport = makeFakeTransport();
    if (stop) Object.assign(transport, { stopTurn: stop });
    const store = createChatStore({
      transport,
      config: resolveConfig({}),
      userId: "member",
      batch: "sync",
    });
    return { store, transport };
  }

  it("stops the running reply through the transport", async () => {
    const stop = vi.fn(async () => {});
    const { store } = storeWith(stop);
    expect(store.getState().canStop).toBe(true);
    await store.actions.send("hello");
    expect(store.getState().status).toBe("streaming");
    await store.actions.stopTurn();
    expect(stop).toHaveBeenCalledWith(store.getState().threadId);
  });

  it("does nothing when idle, or when the transport cannot stop", async () => {
    const stop = vi.fn(async () => {});
    const idle = storeWith(stop);
    await idle.store.actions.stopTurn();
    expect(stop).not.toHaveBeenCalled();

    const widget = storeWith();
    expect(widget.store.getState().canStop).toBe(false);
    await widget.store.actions.send("hello");
    await widget.store.actions.stopTurn();
  });
});
