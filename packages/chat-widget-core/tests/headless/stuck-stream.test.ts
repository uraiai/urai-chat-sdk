import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { createChatStore, isTurnFinished } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { WidgetEvent } from "../../src/events";
import type { ServerMessage } from "../../src/transport";

function row(over: Partial<ServerMessage> & Pick<ServerMessage, "id" | "message_idx" | "role">): ServerMessage {
  return {
    thread_id: "t1",
    content: "",
    reasoning: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const user = row({ id: "u1", message_idx: 0, role: "user", content: "hello" });
/** The empty row the server writes at send time. */
const placeholder = row({ id: "a1", message_idx: 1, role: "assistant" });
/** The same row once the turn is finalized. */
const finished = row({
  id: "a1",
  message_idx: 1,
  role: "assistant",
  content: "Hi there",
  reasoning: "",
});

function setup() {
  const messages: Record<string, ServerMessage[]> = {};
  const transport = makeFakeTransport({ messages });
  const events: WidgetEvent[] = [];
  const store = createChatStore({
    transport,
    config: resolveConfig({}),
    userId: "visitor-1",
    emit: (e) => events.push(e),
    batch: "sync",
    turnPollMs: 5000,
  });
  return { store, transport, events, messages };
}

const listCalls = (t: ReturnType<typeof makeFakeTransport>) =>
  t.callNames().filter((n) => n === "listMessages").length;

describe("isTurnFinished", () => {
  it("is false for the empty placeholder", () => {
    expect(isTurnFinished([user, placeholder], "a1")).toBe(false);
  });

  it("is true once the row is finalized, even with empty content", () => {
    expect(isTurnFinished([user, { ...finished, content: "" }], "a1")).toBe(true);
  });

  it("is true when a later message follows the reply", () => {
    const next = row({ id: "u2", message_idx: 2, role: "user", content: "more" });
    expect(isTurnFinished([user, placeholder, next], "a1")).toBe(true);
  });

  it("is false when the reply is not in history", () => {
    expect(isTurnFinished([user], "a1")).toBe(false);
  });
});

describe("store: a stream that never ends", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps streaming while history holds only the placeholder", async () => {
    const { store, transport, messages } = setup();
    await store.actions.send("hello");
    messages.t1 = [user, placeholder];

    await vi.advanceTimersByTimeAsync(5000);
    expect(listCalls(transport)).toBe(1);
    expect(store.getState().status).toBe("streaming");
    expect(transport.streamClosed()).toBe(false);
  });

  it("recovers the reply from history and ends the turn", async () => {
    const { store, transport, events, messages } = setup();
    await store.actions.send("hello");
    messages.t1 = [user, placeholder];
    await vi.advanceTimersByTimeAsync(5000);

    messages.t1 = [user, finished];
    await vi.advanceTimersByTimeAsync(5000);

    const s = store.getState();
    expect(s.status).toBe("idle");
    expect(s.stream).toBeNull();
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hello"],
      ["assistant", "Hi there"],
    ]);
    expect(transport.streamClosed()).toBe(true);
    expect(events).toContainEqual({ type: "assistant-reply", content: "Hi there" });

    // The check stops with the turn.
    await vi.advanceTimersByTimeAsync(20000);
    expect(listCalls(transport)).toBe(2);
  });

  it("stops checking when the stream ends normally", async () => {
    const { store, transport } = setup();
    await store.actions.send("hello");
    transport.lastStreamHandlers()?.onDone?.();

    await vi.advanceTimersByTimeAsync(20000);
    expect(listCalls(transport)).toBe(0);
  });

  it("stops checking on stop()", async () => {
    const { store, transport } = setup();
    await store.actions.send("hello");
    store.actions.stop();

    await vi.advanceTimersByTimeAsync(20000);
    expect(listCalls(transport)).toBe(0);
  });

  it("keeps checking after a failed history fetch", async () => {
    const { store, transport, messages } = setup();
    await store.actions.send("hello");
    const listMessages = transport.listMessages.bind(transport);
    transport.listMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(listMessages);
    messages.t1 = [user, finished];

    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState().status).toBe("streaming");
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getState().status).toBe("idle");
  });
});
