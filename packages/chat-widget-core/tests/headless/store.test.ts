import { describe, it, expect, vi } from "vitest";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { createChatStore, type ChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { WidgetEvent } from "../../src/events";
import type { SessionStore } from "../../src/headless/persistence";

function memorySession(initial: string | null = null): SessionStore & {
  value: string | null;
} {
  return {
    value: initial,
    load() {
      return this.value;
    },
    save(id: string) {
      this.value = id;
    },
    clear() {
      this.value = null;
    },
  };
}

function makeStore(
  over: {
    transport?: FakeTransport | null;
    session?: SessionStore;
    behavior?: Record<string, unknown>;
    events?: WidgetEvent[];
  } = {},
) {
  const transport = over.transport === undefined ? makeFakeTransport() : over.transport;
  const events = over.events ?? [];
  const store = createChatStore({
    transport,
    config: resolveConfig({ behavior: over.behavior as never }),
    userId: "visitor-1",
    session: over.session,
    emit: (e) => events.push(e),
    // Synchronous notifications: no test needs fake rAF.
    batch: "sync",
  });
  return { store, transport: transport as FakeTransport, events };
}

/** Drive the most recent stream the fake transport opened. */
function stream(t: FakeTransport) {
  const h = t.lastStreamHandlers();
  if (!h) throw new Error("no stream open");
  return h;
}

describe("store: purity and subscription", () => {
  it("touches nothing on construction", () => {
    const { transport } = makeStore();
    expect(transport.calls).toEqual([]);
  });

  it("returns a cached snapshot that only changes on a transition", () => {
    const { store } = makeStore();
    const a = store.getState();
    expect(store.getState()).toBe(a);
    store.actions.setDraft("hi");
    expect(store.getState()).not.toBe(a);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const { store } = makeStore();
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.actions.setDraft("a");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    store.actions.setDraft("b");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("store: ensureThread", () => {
  it("always sends force_new on the create path", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    expect(transport.calls[0]).toEqual({
      method: "createOrResumeThread",
      args: [{ force_new: true }],
    });
  });

  it("includes vars when they are set", async () => {
    const { store, transport } = makeStore();
    store.actions.setVars({ plan: "pro" });
    await store.actions.send("hello");
    expect(transport.calls[0].args[0]).toEqual({
      force_new: true,
      vars: { plan: "pro" },
    });
  });

  it("resumes a cached thread and hydrates its history", async () => {
    const session = memorySession("t-cached");
    const transport = makeFakeTransport({
      messages: {
        "t-cached": [
          {
            id: "m1",
            thread_id: "t-cached",
            message_idx: 0,
            role: "user",
            content: "earlier",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    const { store } = makeStore({ transport, session });
    await store.actions.send("hello");
    expect(store.getState().threadId).toBe("t-cached");
    expect(transport.callNames()).not.toContain("createOrResumeThread");
    expect(store.getState().messages[0].content).toBe("earlier");
  });

  it("drops a stale cache and creates fresh when history fails", async () => {
    const session = memorySession("t-stale");
    const transport = makeFakeTransport({
      fail: { listMessages: new Error("410 gone") },
    });
    const { store } = makeStore({ transport, session });
    await store.actions.send("hello");
    expect(session.value).toBe("t1");
    expect(transport.callNames()).toContain("createOrResumeThread");
  });

  it("persists the created thread id", async () => {
    const session = memorySession();
    const { store } = makeStore({ session });
    await store.actions.send("hello");
    expect(session.value).toBe("t1");
  });
});

describe("store: send pipeline", () => {
  it("calls create then send then stream, in that order", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    expect(transport.callNames()).toEqual([
      "createOrResumeThread",
      "sendMessage",
      "streamMessage",
    ]);
  });

  it("ignores an empty submit", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("   ");
    expect(transport.calls).toEqual([]);
  });

  it("appends the user message optimistically and clears the draft", async () => {
    const { store, events } = makeStore();
    store.actions.setDraft("hello");
    await store.actions.send();
    const s = store.getState();
    expect(s.draft).toBe("");
    expect(s.messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(events).toContainEqual({ type: "user-message", content: "hello" });
  });

  it("does not start a second turn while one is in flight", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("first");
    await store.actions.send("second");
    expect(transport.callNames().filter((n) => n === "sendMessage")).toHaveLength(1);
  });

  it("surfaces a send failure as an error row", async () => {
    const transport = makeFakeTransport({
      fail: { sendMessage: new Error("503 unavailable") },
    });
    const { store, events } = makeStore({ transport });
    await store.actions.send("hello");
    const s = store.getState();
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)).toMatchObject({
      role: "error",
      content: "503 unavailable",
    });
    expect(events).toContainEqual({ type: "error", error: "503 unavailable" });
  });
});

describe("store: streaming", () => {
  it("keeps the messages array identity across every token", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const before = store.getState().messages;
    for (let i = 0; i < 200; i++) stream(transport).onChunk?.("tok ");
    expect(store.getState().messages).toBe(before);
    expect(store.getState().stream?.content).toHaveLength(800);
  });

  it("stays unattached until the first signal, then attaches", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    expect(store.getState().stream?.attached).toBe(false);
    stream(transport).onChunk?.("hi");
    expect(store.getState().stream?.attached).toBe(true);
  });

  it("attaches on a reasoning-only turn", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    stream(transport).onReasoning?.("pondering");
    expect(store.getState().stream?.attached).toBe(true);
  });

  it("attaches on done even with no output at all", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onDone?.();
    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "",
    });
  });

  it("seals reasoning at the first content token only", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onReasoning?.("thinking");
    h.onChunk?.("answer ");
    expect(store.getState().stream?.reasoning).toEqual({
      text: "thinking",
      sealed: true,
    });
    // A second chunk must not re-seal or swallow late reasoning state.
    h.onChunk?.("more");
    expect(store.getState().stream?.reasoning?.text).toBe("thinking");
  });

  it("replaces the buffer on complete rather than appending", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onChunk?.("partial");
    h.onComplete?.({
      id: "a1",
      thread_id: "t1",
      message_idx: 1,
      role: "assistant",
      content: "the authoritative answer",
      reasoning: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(store.getState().stream?.content).toBe("the authoritative answer");
  });

  it("commits the stream into messages on done and emits the reply", async () => {
    const { store, transport, events } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onChunk?.("answer");
    h.onDone?.();
    const s = store.getState();
    expect(s.stream).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)).toMatchObject({ role: "assistant", content: "answer" });
    expect(events).toContainEqual({ type: "assistant-reply", content: "answer" });
  });

  it("shows the most recent tool label and keeps a completed entry relabelable", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onToolCallStarted?.({ id: "c1", fn_name: "web_search" });
    expect(store.getState().stream?.tool).toEqual({
      label: "Searching the web",
      completed: false,
    });
    h.onToolCallCompleted?.({ id: "c1", ok: true });
    h.onToolCallSummary?.({ id: "c1", summary: "Found three results" });
    expect(store.getState().stream?.tool).toEqual({
      label: "Found three results",
      completed: true,
    });
  });

  it("clears tool activity when the turn ends", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    h.onToolCallStarted?.({ id: "c1", fn_name: "run_code" });
    h.onDone?.();
    expect(store.getState().stream).toBeNull();
  });

  it("turns a stream error into an error row", async () => {
    const { store, transport, events } = makeStore();
    await store.actions.send("hello");
    stream(transport).onError?.("model exploded");
    const s = store.getState();
    expect(s.stream).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)).toMatchObject({ role: "error", content: "model exploded" });
    expect(events).toContainEqual({ type: "error", error: "model exploded" });
  });

  it("bubbles commands verbatim", async () => {
    const { store, transport, events } = makeStore();
    await store.actions.send("hello");
    stream(transport).onCommand?.({ kind: "navigate", to: "/pricing" });
    expect(events).toContainEqual({
      type: "command",
      command: { kind: "navigate", to: "/pricing" },
    });
  });
});

describe("store: attachments", () => {
  const file = (name = "a.png") => new File(["x"], name, { type: "image/png" });

  it("moves a pending attachment to ready", async () => {
    const { store } = makeStore();
    store.actions.addFiles([file()]);
    expect(store.getState().attachments[0].status).toBe("uploading");
    await vi.waitFor(() =>
      expect(store.getState().attachments[0].status).toBe("ready"),
    );
  });

  it("marks a failed upload without blocking removal", async () => {
    const transport = makeFakeTransport({
      fail: { uploadAttachment: new Error("413 too large") },
    });
    const { store } = makeStore({ transport });
    store.actions.addFiles([file()]);
    await vi.waitFor(() =>
      expect(store.getState().attachments[0].status).toBe("error"),
    );
    store.actions.removeAttachment(store.getState().attachments[0].localId);
    expect(store.getState().attachments).toHaveLength(0);
  });

  it("waits for an in-flight upload before sending", async () => {
    const { store, transport } = makeStore();
    store.actions.addFiles([file()]);
    await store.actions.send("with a file");
    const sent = transport.calls.find((c) => c.method === "sendMessage");
    expect(sent?.args[2]).toEqual([
      { file_name: "a.png", mime_type: "image/png", bucket_path: "uploads/a.png" },
    ]);
  });

  it("bails with an error when every upload failed and there is no text", async () => {
    const transport = makeFakeTransport({
      fail: { uploadAttachment: new Error("nope") },
    });
    const { store } = makeStore({ transport });
    store.actions.addFiles([file()]);
    await vi.waitFor(() =>
      expect(store.getState().attachments[0].status).toBe("error"),
    );
    await store.actions.send("");
    expect(store.getState().messages.at(-1)).toMatchObject({
      role: "error",
      content: "Attachment upload failed",
    });
    expect(transport.callNames()).not.toContain("sendMessage");
    expect(store.getState().status).toBe("idle");
  });
});

describe("store: threads", () => {
  it("loads the thread list", async () => {
    const transport = makeFakeTransport({
      threads: [
        {
          id: "t1",
          title: "Refund",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          last_message_at: null,
          last_message_preview: null,
        },
      ],
    });
    const { store } = makeStore({ transport });
    await store.actions.loadThreads();
    expect(store.getState().threads.items).toHaveLength(1);
    expect(store.getState().threads.loading).toBe(false);
  });

  it("degrades to an empty list rather than an error banner", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = makeFakeTransport({
      fail: { listThreads: new Error("500") },
    });
    const { store } = makeStore({ transport });
    await store.actions.loadThreads();
    expect(store.getState().threads.items).toEqual([]);
    warn.mockRestore();
  });

  it("switching threads replaces the transcript and persists the id", async () => {
    const session = memorySession();
    const transport = makeFakeTransport({
      messages: {
        t9: [
          {
            id: "m9",
            thread_id: "t9",
            message_idx: 0,
            role: "assistant",
            content: "older answer",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    const { store } = makeStore({ transport, session });
    await store.actions.selectThread("t9");
    expect(store.getState().messages[0].content).toBe("older answer");
    expect(session.value).toBe("t9");
  });

  it("selecting the current thread is a no-op", async () => {
    const { store, transport } = makeStore();
    await store.actions.selectThread("t9");
    const before = transport.calls.length;
    await store.actions.selectThread("t9");
    expect(transport.calls).toHaveLength(before);
  });
});

describe("store: identity and reset", () => {
  it("newConversation clears the thread and arms forceNew", async () => {
    const { store } = makeStore();
    await store.actions.send("hello");
    store.actions.newConversation();
    const s = store.getState();
    expect(s.threadId).toBeNull();
    expect(s.forceNewOnNextCreate).toBe(true);
    expect(s.messages).toEqual([]);
    expect(s.threads.items).toBeNull();
  });

  /**
   * The reset has to reach storage, not just state. `ensureThread`
   * consults the persisted id before it considers creating anything, so
   * leaving it behind means the next message silently resumes the
   * conversation the visitor just asked to leave.
   */
  it("creates a fresh thread after newConversation, not the old one", async () => {
    const session = memorySession();
    const transport = makeFakeTransport({
      messages: {
        t1: [
          {
            id: "m1",
            thread_id: "t1",
            message_idx: 0,
            role: "user",
            content: "the old conversation",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    const { store } = makeStore({ transport, session });

    await store.actions.send("first");
    expect(store.getState().threadId).toBe("t1");

    store.actions.newConversation();
    expect(session.value).toBeNull();

    await store.actions.send("second");
    expect(store.getState().threadId).toBe("t2");
    expect(
      store.getState().messages.some((m) => m.content === "the old conversation"),
    ).toBe(false);
    expect(
      transport.callNames().filter((n) => n === "createOrResumeThread"),
    ).toHaveLength(2);
  });

  it("still resumes a cached thread when no reset is pending", async () => {
    const session = memorySession("t-cached");
    const { store, transport } = makeStore({ session });
    await store.actions.send("hello");
    expect(store.getState().threadId).toBe("t-cached");
    expect(transport.callNames()).not.toContain("createOrResumeThread");
  });

  it("auto-restore is skipped while a reset is pending", async () => {
    const session = memorySession("t-old");
    const { store, transport } = makeStore({ session });
    store.actions.newConversation();
    await store.actions.start();
    expect(transport.callNames()).not.toContain("listMessages");
    expect(store.getState().threadId).toBeNull();
  });

  it("auto-restore loads the cached conversation", async () => {
    const session = memorySession("t-old");
    const transport = makeFakeTransport({
      messages: {
        "t-old": [
          {
            id: "m1",
            thread_id: "t-old",
            message_idx: 0,
            role: "user",
            content: "before",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    const { store } = makeStore({ transport, session });
    await store.actions.start();
    expect(store.getState().threadId).toBe("t-old");
    expect(store.getState().messages[0].content).toBe("before");
  });

  it("changing identity clears the conversation and disarms forceNew", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    store.actions.newConversation();
    store.actions.setUser("visitor-2");
    const s = store.getState();
    expect(s.userId).toBe("visitor-2");
    expect(s.threadId).toBeNull();
    expect(s.messages).toEqual([]);
    expect(s.forceNewOnNextCreate).toBe(false);
    expect(transport.callNames()).toContain("setWidgetUserId");
  });

  it("same identity with new vars patches the server without clearing", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const messagesBefore = store.getState().messages;
    store.actions.setUser("visitor-1", { plan: "pro" });
    expect(store.getState().messages).toBe(messagesBefore);
    expect(transport.callNames()).toContain("updateThreadVars");
  });

  it("setVars patches only when a thread exists", async () => {
    const { store, transport } = makeStore();
    store.actions.setVars({ a: 1 });
    expect(transport.callNames()).not.toContain("updateThreadVars");
    await store.actions.send("hello");
    store.actions.setVars({ a: 2 });
    expect(transport.callNames()).toContain("updateThreadVars");
  });
});

describe("store: start/stop generation", () => {
  it("start is idempotent", async () => {
    const session = memorySession("t-old");
    const { store, transport } = makeStore({ session });
    await store.actions.start();
    await store.actions.start();
    expect(transport.callNames().filter((n) => n === "listMessages")).toHaveLength(1);
  });

  // A one-way `destroyed` latch cannot survive StrictMode's
  // mount -> unmount -> mount; a generation counter can. The store must
  // still be usable after a stop.
  it("re-arms after stop rather than latching dead", async () => {
    const { store, transport } = makeStore();
    await store.actions.start();
    store.actions.stop();
    await store.actions.start();
    await store.actions.send("still alive");
    expect(transport.callNames()).toContain("sendMessage");
  });

  // Restoring twice would be a wasted round-trip, so a second start with
  // a thread already loaded correctly does nothing.
  it("does not re-restore a conversation it already has", async () => {
    const session = memorySession("t-old");
    const { store, transport } = makeStore({ session });
    await store.actions.start();
    store.actions.stop();
    await store.actions.start();
    expect(transport.callNames().filter((n) => n === "listMessages")).toHaveLength(1);
  });

  it("stop closes an in-flight stream", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    expect(transport.streamClosed()).toBe(false);
    store.actions.stop();
    expect(transport.streamClosed()).toBe(true);
  });

  it("ignores stream events from a superseded generation", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hello");
    const h = stream(transport);
    store.actions.stop();
    h.onChunk?.("ghost");
    h.onDone?.();
    expect(store.getState().stream).toBeNull();
    expect(
      store.getState().messages.some((m) => m.content === "ghost"),
    ).toBe(false);
  });
});
