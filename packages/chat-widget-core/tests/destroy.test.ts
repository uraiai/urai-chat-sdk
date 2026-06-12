import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import {
  FakeEventSource,
  installFakeEventSource,
  installFakeFetch,
  flushAsync,
} from "./helpers";

const TOKEN = "11111111-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";

function widgetRoutes() {
  return {
    [`GET /api/widget/v1/${TOKEN}/config`]: () => ({
      widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
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

function makeWidget() {
  return createUraiChatWidget({
    widgetToken: TOKEN,
    userId: "visitor-1",
    baseUrl: BASE,
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

describe("destroy", () => {
  it("removes the host element from the DOM", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;
    expect(document.querySelector("[data-urai-chat-widget]")).not.toBeNull();
    w.destroy();
    expect(document.querySelector("[data-urai-chat-widget]")).toBeNull();
  });

  it("closes an in-flight SSE stream", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;
    w.open();
    w.sendMessage("Hello");
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("message", "partial ");
    expect(es.closed).toBe(false);

    w.destroy();
    expect(es.closed).toBe(true);
  });

  it("emits destroyed once, then nothing further", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;

    const events: string[] = [];
    w.on("destroyed", () => events.push("destroyed"));
    w.on("opened", () => events.push("opened"));

    w.destroy();
    w.open(); // ignored after destroy
    expect(events).toEqual(["destroyed"]);
  });

  it("is a no-op when called twice", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;
    const destroyedListener = vi.fn();
    w.on("destroyed", destroyedListener);
    w.destroy();
    w.destroy();
    expect(destroyedListener).toHaveBeenCalledOnce();
  });

  it("does not mount when destroyed while config fetch is in flight", async () => {
    let resolveConfigFetch!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveConfigFetch = resolve;
          }),
      ),
    );
    const w = makeWidget();
    w.destroy();
    resolveConfigFetch({
      ok: true,
      status: 200,
      json: async () => ({
        widget: { id: "w1", name: "T", theme: {}, layout: {}, behavior: {} },
        assistant: { id: "a1", name: "B", description: null },
      }),
    });
    await w.ready;
    expect(document.querySelector("[data-urai-chat-widget]")).toBeNull();
  });

  it("does not emit stream events arriving after destroy", async () => {
    installFakeFetch(widgetRoutes());
    const w = makeWidget();
    await w.ready;
    w.open();
    w.sendMessage("Hello");
    await flushAsync();

    const replies = vi.fn();
    const commands = vi.fn();
    w.on("assistant-reply", replies);
    w.on("command", commands);
    const es = FakeEventSource.last()!;
    w.destroy();
    // Straggling frames after teardown must be ignored.
    es.dispatch("command", JSON.stringify({ command: "navigate" }));
    es.dispatch("complete", JSON.stringify({ id: "a1", content: "late" }));
    expect(replies).not.toHaveBeenCalled();
    expect(commands).not.toHaveBeenCalled();
  });
});
