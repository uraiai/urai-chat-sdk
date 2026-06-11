import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import {
  installFakeEventSource,
  installFakeFetch,
  flushAsync,
} from "./helpers";

const TOKEN = "11111111-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";

function widgetRoutes() {
  return {
    [`GET /api/widget/v1/${TOKEN}/config`]: () => ({
      widget: {
        id: "w1",
        name: "Test",
        theme: { primaryColor: "#abcdef" },
        layout: { brandName: "Server Brand" },
        behavior: {},
      },
      assistant: { id: "a1", name: "Bot", description: null },
    }),
    [`GET /api/widget/v1/${TOKEN}/threads`]: () => [],
    [`POST /api/widget/v1/${TOKEN}/threads`]: () => ({
      thread_id: "t1",
      created: true,
    }),
    [`POST /api/widget/v1/${TOKEN}/threads/t1/messages`]: () => ({
      user_message_id: "u1",
      assistant_message_id: "a1",
      thread_id: "t1",
      stream_url: "/ignored",
    }),
  };
}

function makeWidget(overrides: Record<string, unknown> = {}) {
  return createUraiChatWidget({
    widgetToken: TOKEN,
    userId: "visitor-1",
    baseUrl: BASE,
    ...overrides,
  });
}

beforeEach(() => {
  localStorage.clear();
  installFakeEventSource();
});

afterEach(() => {
  document
    .querySelectorAll("[data-urai-chat-widget]")
    .forEach((el) => el.remove());
  vi.unstubAllGlobals();
});

describe("createUraiChatWidget", () => {
  it("validates required options", () => {
    expect(() => makeWidget({ widgetToken: "" })).toThrow("widgetToken");
    expect(() => makeWidget({ userId: "  " })).toThrow("userId");
  });

  it("defaults baseUrl to the hosted Urai deployment", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            widget: { id: "w1", name: "T", theme: {}, layout: {}, behavior: {} },
            assistant: { id: "a1", name: "B", description: null },
          }),
        };
      }),
    );
    const w = makeWidget({ baseUrl: undefined });
    await w.ready;
    expect(calls[0]).toBe(
      `https://chat.app.urai.dev/api/widget/v1/${TOKEN}/config`,
    );
    w.destroy();
  });

  it("mounts a floating widget into document.body after ready", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;
    const host = document.querySelector("[data-urai-chat-widget]");
    expect(host).not.toBeNull();
    expect(host!.parentElement).toBe(document.body);
    w.destroy();
  });

  it("mounts inline into a provided container", async () => {
    installFakeFetch(widgetRoutes());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const w = makeWidget({ container });
    await w.ready;
    expect(container.querySelector("[data-urai-chat-widget]")).not.toBeNull();
    w.destroy();
    container.remove();
  });

  it("emits ready and resolves the ready promise", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    const readyListener = vi.fn();
    w.on("ready", readyListener);
    await w.ready;
    expect(readyListener).toHaveBeenCalledOnce();
    w.destroy();
  });

  it("queues calls made before mount and replays them in order", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    const opened = vi.fn();
    w.on("opened", opened);
    w.open(); // before ready — must be queued, not dropped
    expect(opened).not.toHaveBeenCalled();
    await w.ready;
    expect(opened).toHaveBeenCalledOnce();
    w.destroy();
  });

  it("falls back to defaults and emits error when config fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = makeWidget();
    const errors: string[] = [];
    w.on("error", (e) => {
      if (e.type === "error") errors.push(e.error);
    });
    await w.ready;
    // Widget still mounts with defaults despite the 403.
    expect(document.querySelector("[data-urai-chat-widget]")).not.toBeNull();
    expect(errors[0]).toContain("config fetch failed");
    w.destroy();
    warn.mockRestore();
  });

  it("skips the config fetch when fetchServerConfig is false", async () => {
    const { mock } = installFakeFetch(widgetRoutes());
    const w = makeWidget({ fetchServerConfig: false });
    await w.ready;
    expect(mock).not.toHaveBeenCalled();
    w.destroy();
  });

  it("keeps events isolated between two instances", async () => {
    installFakeFetch(widgetRoutes());
    const w1 = makeWidget();
    const w2 = makeWidget({ userId: "visitor-2" });
    await Promise.all([w1.ready, w2.ready]);

    const opened1 = vi.fn();
    const opened2 = vi.fn();
    w1.on("opened", opened1);
    w2.on("opened", opened2);

    w1.open();
    expect(opened1).toHaveBeenCalledOnce();
    expect(opened2).not.toHaveBeenCalled();

    w1.destroy();
    w2.destroy();
  });

  it("emits user-message and streams the assistant reply", async () => {
    installFakeEventSource();
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;

    const userMessages: string[] = [];
    const replies: string[] = [];
    w.on("user-message", (e) => {
      if (e.type === "user-message") userMessages.push(e.content);
    });
    w.on("assistant-reply", (e) => {
      if (e.type === "assistant-reply") replies.push(e.content);
    });

    w.open();
    w.sendMessage("Hello there");
    await flushAsync();

    expect(userMessages).toEqual(["Hello there"]);

    const { FakeEventSource } = await import("./helpers");
    const es = FakeEventSource.last()!;
    es.dispatch("message", "Hi ");
    es.dispatch("message", "back");
    es.dispatch("complete", JSON.stringify({ id: "a1", content: "Hi back" }));

    expect(replies).toEqual(["Hi back"]);
    w.destroy();
  });
});
