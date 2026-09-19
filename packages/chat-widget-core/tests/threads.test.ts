import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import type { WidgetEvent } from "../src/events";
import {
  flushAsync,
  installFakeEventSource,
  installFakeFetch,
  respond,
} from "@uraiai/chat-test-support";

/**
 * Thread ids and read-only mode in the imperative widget. Its DOM sits in a
 * closed shadow root, so the root is captured as it is attached.
 */

const TOKEN = "11111111-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";
const API = `/api/widget/v1/${TOKEN}`;

let shadow: ShadowRoot | null = null;

function history(threadId: string, content: string) {
  return [
    {
      id: `${threadId}-m`,
      thread_id: threadId,
      message_idx: 0,
      role: "assistant",
      content,
      reasoning: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
}

function summary(threadId: string, title: string) {
  return {
    id: threadId,
    title,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_message_at: null,
    last_message_preview: null,
  };
}

function routes() {
  return {
    [`GET ${API}/config`]: () => ({
      widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
      assistant: { id: "a1", name: "Bot", description: null },
    }),
    [`POST ${API}/threads`]: () => ({ thread_id: "t1", created: true }),
    [`POST ${API}/threads/t1/messages`]: () => ({
      user_message_id: "u1",
      assistant_message_id: "a1",
      thread_id: "t1",
      stream_url: "/ignored",
    }),
    [`GET ${API}/threads/tA/messages`]: () => history("tA", "answer A"),
    [`GET ${API}/threads/tA`]: () => summary("tA", "Billing question"),
    [`GET ${API}/threads/tB/messages`]: () => history("tB", "answer B"),
    [`GET ${API}/threads/tB`]: () => summary("tB", "Refund"),
    [`GET ${API}/threads/tX/messages`]: () => respond({ status: 404 }),
    [`GET ${API}/threads/tX`]: () => respond({ status: 404 }),
  };
}

function makeWidget(over: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const events: WidgetEvent[] = [];
  const w = createUraiChatWidget({
    widgetToken: TOKEN,
    userId: "visitor-1",
    baseUrl: BASE,
    container,
    ...over,
  });
  for (const name of ["thread-change", "error"] as const) {
    w.on(name, (e) => events.push(e));
  }
  return { w, events };
}

const text = () => shadow?.querySelector(".ucw-body")?.textContent ?? "";
const threadChanges = (events: WidgetEvent[]) =>
  events.flatMap((e) =>
    e.type === "thread-change" ? [[e.threadId, e.reason] as const] : [],
  );

beforeEach(() => {
  localStorage.clear();
  installFakeEventSource();
  shadow = null;
  const attach = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, "attachShadow").mockImplementation(function (
    this: HTMLElement,
    init: ShadowRootInit,
  ) {
    shadow = attach.call(this, init);
    return shadow;
  });
});

afterEach(() => {
  document.querySelectorAll("[data-urai-chat-widget]").forEach((el) => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("widget: thread-change", () => {
  it("reports the created thread and exposes it through getThreadId", async () => {
    installFakeFetch(routes());
    const { w, events } = makeWidget();
    await w.ready;
    expect(w.getThreadId()).toBeNull();
    w.sendMessage("hello");
    await flushAsync();
    expect(threadChanges(events)).toEqual([["t1", "created"]]);
    expect(w.getThreadId()).toBe("t1");
  });

  it("reports a reset", async () => {
    installFakeFetch(routes());
    const { w, events } = makeWidget({ threadId: "tA" });
    await w.ready;
    await flushAsync();
    w.startConversation();
    expect(threadChanges(events)).toEqual([
      ["tA", "opened"],
      [null, "reset"],
    ]);
  });

  it("fetches a saved thread's summary", async () => {
    installFakeFetch(routes());
    const { w } = makeWidget();
    expect((await w.getThreadSummary("tB"))?.title).toBe("Refund");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await w.getThreadSummary("tX")).toBeNull();
  });
});

describe("widget: threadId + readOnly", () => {
  it("opens the requested thread instead of the saved one", async () => {
    localStorage.setItem(
      "urai_chat_widget",
      JSON.stringify({ [TOKEN]: { "visitor-1": { thread_id: "tB" } } }),
    );
    const { calls } = installFakeFetch(routes());
    const { w } = makeWidget({ threadId: "tA" });
    await w.ready;
    await flushAsync();
    expect(text()).toContain("answer A");
    expect(calls.some((c) => c.pathname === `${API}/threads/tB/messages`)).toBe(false);
  });

  it("renders read-only: no composer or switcher, titled by the thread", async () => {
    installFakeFetch(routes());
    const { w } = makeWidget({ threadId: "tA", readOnly: true });
    await w.ready;
    await flushAsync();
    expect(text()).toContain("answer A");
    expect(shadow?.querySelector(".ucw-composer")).toBeNull();
    expect(shadow?.querySelector(".ucw-thread-trigger")).toBeNull();
    expect(shadow?.querySelector(".ucw-header .ucw-title")?.textContent).toBe(
      "Billing question",
    );
  });

  it("refuses to send, reset or patch, and leaves storage alone", async () => {
    localStorage.setItem(
      "urai_chat_widget",
      JSON.stringify({ [TOKEN]: { "visitor-1": { thread_id: "tB" } } }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls } = installFakeFetch(routes());
    const { w } = makeWidget({ threadId: "tA", readOnly: true });
    await w.ready;
    await flushAsync();
    w.sendMessage("hello");
    w.startConversation();
    w.setVars({ plan: "pro" });
    await flushAsync();
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(text()).toContain("answer A");
    expect(JSON.parse(localStorage.getItem("urai_chat_widget")!)).toEqual({
      [TOKEN]: { "visitor-1": { thread_id: "tB" } },
    });
    expect(warn).toHaveBeenCalled();
  });

  it("opens another thread in place", async () => {
    installFakeFetch(routes());
    const { w, events } = makeWidget({ threadId: "tA", readOnly: true });
    await w.ready;
    await flushAsync();
    w.openThread("tB");
    await flushAsync();
    expect(text()).toContain("answer B");
    expect(text()).not.toContain("answer A");
    expect(threadChanges(events)).toEqual([
      ["tA", "opened"],
      ["tB", "opened"],
    ]);
  });

  it("says so when the thread is not the visitor's", async () => {
    installFakeFetch(routes());
    const { w, events } = makeWidget({ threadId: "tX", readOnly: true });
    await w.ready;
    await flushAsync();
    expect(text()).toContain("This conversation is unavailable.");
    expect(w.getThreadId()).toBeNull();
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
