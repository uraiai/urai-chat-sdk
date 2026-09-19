import { describe, it, expect, vi } from "vitest";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { createChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { WidgetEvent } from "../../src/events";
import type { SessionStore } from "../../src/headless/persistence";
import type { ServerMessage } from "../../src/transport";

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

function message(threadId: string, content: string): ServerMessage {
  return {
    id: `${threadId}-m`,
    thread_id: threadId,
    message_idx: 0,
    role: "assistant",
    content,
    reasoning: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const HISTORY = {
  tA: [message("tA", "answer A")],
  tB: [message("tB", "answer B")],
};

function makeStore(
  over: {
    transport?: FakeTransport;
    session?: SessionStore;
    threadId?: string | null;
    readOnly?: boolean;
  } = {},
) {
  const transport = over.transport ?? makeFakeTransport({ messages: HISTORY });
  const events: WidgetEvent[] = [];
  const store = createChatStore({
    transport,
    config: resolveConfig(),
    userId: "visitor-1",
    session: over.session,
    threadId: over.threadId,
    readOnly: over.readOnly,
    emit: (e) => events.push(e),
    batch: "sync",
  });
  const threadChanges = () =>
    events.flatMap((e) =>
      e.type === "thread-change"
        ? [{ threadId: e.threadId, previous: e.previousThreadId, reason: e.reason }]
        : [],
    );
  return { store, transport, events, threadChanges };
}

describe("thread-change events", () => {
  it("emits created before the first message is sent", async () => {
    const { store, transport, events } = makeStore();
    await store.actions.send("hello");
    const created = events.findIndex((e) => e.type === "thread-change");
    expect(events[created]).toMatchObject({
      type: "thread-change",
      threadId: "t1",
      previousThreadId: null,
      reason: "created",
    });
    // The host has the id before the send; a failed send still leaves it.
    expect(transport.callNames().indexOf("createOrResumeThread")).toBeLessThan(
      transport.callNames().indexOf("sendMessage"),
    );
  });

  it("emits created even when the send then fails", async () => {
    const transport = makeFakeTransport({ fail: { sendMessage: new Error("boom") } });
    const { store, threadChanges } = makeStore({ transport });
    await store.actions.send("hello");
    expect(threadChanges()).toEqual([{ threadId: "t1", previous: null, reason: "created" }]);
  });

  it("does not emit again for a second message in the same thread", async () => {
    const { store, transport, threadChanges } = makeStore();
    await store.actions.send("one");
    transport.lastStreamHandlers()!.onDone();
    await store.actions.send("two");
    expect(threadChanges()).toHaveLength(1);
  });

  it("emits restored on auto-restore", async () => {
    const { store, threadChanges } = makeStore({ session: memorySession("tA") });
    await store.actions.start();
    expect(threadChanges()).toEqual([{ threadId: "tA", previous: null, reason: "restored" }]);
  });

  it("emits restored when a send resumes the saved thread", async () => {
    const session = memorySession("tA");
    const { store, threadChanges } = makeStore({ session });
    await store.actions.send("hello");
    expect(threadChanges()).toEqual([{ threadId: "tA", previous: null, reason: "restored" }]);
  });

  it("never emits for a stale saved thread, only for the one created", async () => {
    const transport = makeFakeTransport({ fail: { listMessages: new Error("410 gone") } });
    const { store, threadChanges } = makeStore({
      transport,
      session: memorySession("t-stale"),
    });
    await store.actions.send("hello");
    expect(threadChanges()).toEqual([{ threadId: "t1", previous: null, reason: "created" }]);
  });

  it("emits selected, reset and user-changed", async () => {
    const { store, threadChanges } = makeStore();
    await store.actions.selectThread("tA");
    store.actions.newConversation();
    await store.actions.selectThread("tB");
    store.actions.setUser("visitor-2");
    expect(threadChanges()).toEqual([
      { threadId: "tA", previous: null, reason: "selected" },
      { threadId: null, previous: "tA", reason: "reset" },
      { threadId: "tB", previous: null, reason: "selected" },
      { threadId: null, previous: "tB", reason: "user-changed" },
    ]);
  });

  it("does not emit a reset when there was no thread", () => {
    const { store, threadChanges } = makeStore();
    store.actions.newConversation();
    expect(threadChanges()).toEqual([]);
  });
});

describe("openThread", () => {
  it("opens the threadId option on start instead of auto-restoring", async () => {
    const session = memorySession("tB");
    const { store, transport, threadChanges } = makeStore({ session, threadId: "tA" });
    await store.actions.start();
    const s = store.getState();
    expect(s.threadId).toBe("tA");
    expect(s.messages[0].content).toBe("answer A");
    expect(s.thread?.title).toBe("Thread tA");
    expect(s.threadLoad).toBe("idle");
    expect(transport.calls.filter((c) => c.method === "listMessages")).toEqual([
      { method: "listMessages", args: ["tA"] },
    ]);
    expect(threadChanges()).toEqual([{ threadId: "tA", previous: null, reason: "opened" }]);
    // Interactive: an opened thread becomes the visitor's saved one.
    expect(session.value).toBe("tA");
  });

  it("swaps threads live without a new store", async () => {
    const { store, threadChanges } = makeStore({ threadId: "tA" });
    await store.actions.start();
    await store.actions.openThread("tB");
    expect(store.getState().messages[0].content).toBe("answer B");
    expect(threadChanges().map((c) => c.threadId)).toEqual(["tA", "tB"]);
  });

  it("lets the latest open win when an earlier one resolves last", async () => {
    const transport = makeFakeTransport({ messages: HISTORY });
    let releaseA!: () => void;
    const slowA = new Promise<void>((r) => (releaseA = r));
    const list = transport.listMessages.bind(transport);
    transport.listMessages = async (id) => {
      if (id === "tA") await slowA;
      return list(id);
    };
    const { store } = makeStore({ transport });
    const first = store.actions.openThread("tA");
    await store.actions.openThread("tB");
    releaseA();
    await first;
    expect(store.getState().threadId).toBe("tB");
    expect(store.getState().messages[0].content).toBe("answer B");
  });

  it("reports a thread that is not the visitor's as not-found", async () => {
    const transport = makeFakeTransport({ messages: HISTORY, missingThreads: ["tX"] });
    const { store, events } = makeStore({ transport, threadId: "tX" });
    await store.actions.start();
    const s = store.getState();
    expect(s.threadId).toBeNull();
    expect(s.threadLoad).toBe("not-found");
    expect(s.messages).toEqual([]);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("marks other failures as failed", async () => {
    const transport = makeFakeTransport({ fail: { listMessages: new Error("500") } });
    const { store } = makeStore({ transport, threadId: "tA" });
    await store.actions.start();
    expect(store.getState().threadLoad).toBe("failed");
  });

  it("still shows the transcript when the metadata route fails", async () => {
    const transport = makeFakeTransport({
      messages: HISTORY,
      fail: { getThread: new Error("405") },
    });
    const { store } = makeStore({ transport, threadId: "tA" });
    await store.actions.start();
    expect(store.getState().messages[0].content).toBe("answer A");
    expect(store.getState().thread).toBeNull();
  });

  it("a send after a failed open creates a new thread, not the saved one", async () => {
    const transport = makeFakeTransport({ messages: HISTORY, missingThreads: ["tX"] });
    const { store } = makeStore({
      transport,
      session: memorySession("tB"),
      threadId: "tX",
    });
    await store.actions.start();
    await store.actions.send("hello");
    expect(store.getState().threadId).toBe("t1");
  });

  it("refuses to send while a host-requested thread is loading", async () => {
    const transport = makeFakeTransport({ messages: HISTORY });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const list = transport.listMessages.bind(transport);
    transport.listMessages = async (id) => {
      await gate;
      return list(id);
    };
    const { store } = makeStore({ transport });
    const opening = store.actions.openThread("tA");
    await store.actions.send("too early");
    release();
    await opening;
    expect(transport.callNames()).not.toContain("sendMessage");
  });

  it("openThread(null) clears the conversation", async () => {
    const { store, threadChanges } = makeStore({ threadId: "tA" });
    await store.actions.start();
    await store.actions.openThread(null);
    expect(store.getState().threadId).toBeNull();
    expect(store.getState().messages).toEqual([]);
    expect(threadChanges().at(-1)).toEqual({ threadId: null, previous: "tA", reason: "opened" });
  });

  it("re-issues an open that a stop interrupted", async () => {
    const { store } = makeStore({ threadId: "tA" });
    const first = store.actions.start();
    store.actions.stop();
    await first;
    expect(store.getState().threadId).toBeNull();
    await store.actions.start();
    expect(store.getState().threadId).toBe("tA");
  });

  it("fetchThreadSummary returns null for a thread that is not the visitor's", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { store } = makeStore();
    expect((await store.actions.fetchThreadSummary("tA"))?.title).toBe("Thread tA");
    expect(await store.actions.fetchThreadSummary("nope")).toBeNull();
    warn.mockRestore();
  });
});

describe("read-only", () => {
  function readOnly(over: { transport?: FakeTransport } = {}) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const made = makeStore({ threadId: "tA", readOnly: true, ...over });
    return { ...made, warn };
  }

  it("refuses sends, uploads and resets", async () => {
    const { store, transport, warn } = readOnly();
    await store.actions.start();
    await store.actions.send("hello");
    store.actions.addFiles([new File(["x"], "x.txt")]);
    store.actions.newConversation();
    expect(transport.callNames()).toEqual(["listMessages", "getThread"]);
    expect(store.getState().threadId).toBe("tA");
    expect(store.getState().attachments).toEqual([]);
    warn.mockRestore();
  });

  it("never writes vars or collections to the thread", async () => {
    const { store, transport, warn } = readOnly();
    await store.actions.start();
    store.actions.setVars({ plan: "pro" });
    store.actions.setCollections(["c1"]);
    store.actions.setUser("visitor-1", { plan: "team" });
    expect(transport.callNames()).not.toContain("updateThreadVars");
    expect(transport.callNames()).not.toContain("updateThreadCollections");
    warn.mockRestore();
  });

  it("leaves the visitor's saved thread alone", async () => {
    const session = memorySession("tB");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Even when handed a real session, a read-only store ignores it.
    const { store } = makeStore({ threadId: "tA", readOnly: true, session });
    await store.actions.start();
    await store.actions.openThread(null);
    expect(session.value).toBe("tB");
    warn.mockRestore();
  });

  it("reopens the requested thread for a new visitor", async () => {
    const { store, transport, warn } = readOnly();
    await store.actions.start();
    store.actions.setUser("visitor-2");
    await vi.waitFor(() => expect(store.getState().threadId).toBe("tA"));
    expect(transport.widgetUserId).toBe("visitor-2");
    expect(transport.callNames().filter((n) => n === "listMessages")).toHaveLength(2);
    warn.mockRestore();
  });

  it("warns once per refused action", async () => {
    const { store, warn } = readOnly();
    await store.actions.send("a");
    await store.actions.send("b");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
