import { describe, it, expect } from "vitest";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { createChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { WidgetEvent } from "../../src/events";
import type { ServerMessage } from "../../src/transport";

/**
 * A turn still running when history loads (a reload, the widget reopened,
 * a switch to a thread mid-turn) is picked up from its `stream_url`, which
 * replays it from the start — see chat-service `plans/live-turn-replay.md`.
 */

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
const STREAM_URL = "/api/widget/v1/tok/messages/a1/stream?st=1.sig";
/** The running turn: empty so far, but already holding a sub-agent card. */
const running = row({
  id: "a1",
  message_idx: 1,
  role: "assistant",
  streaming: true,
  stream_url: STREAM_URL,
  delegates: [{ id: "d1", label: "Look it up", status: "running", steps: 0 }],
});

function setup(messages: Record<string, ServerMessage[]>) {
  const transport = makeFakeTransport({ messages });
  const events: WidgetEvent[] = [];
  const store = createChatStore({
    transport,
    config: resolveConfig({}),
    userId: "visitor-1",
    emit: (e) => events.push(e),
    batch: "sync",
    turnPollMs: 0,
  });
  return { store, transport, events };
}

const streamCalls = (t: ReturnType<typeof makeFakeTransport>) =>
  t.calls.filter((c) => c.method === "streamMessage");

describe("store: resuming a running turn", () => {
  it("re-attaches to the running turn when a thread opens", async () => {
    const { store, transport } = setup({ t1: [user, running] });
    await store.actions.openThread("t1");

    expect(streamCalls(transport).map((c) => c.args)).toEqual([["a1", STREAM_URL]]);
    expect(store.getState().status).toBe("streaming");
    expect(store.getState().stream?.messageId).toBe("a1");
  });

  it("leaves the running row out of history so the replay doesn't show it twice", async () => {
    const { store } = setup({ t1: [user, running] });
    await store.actions.openThread("t1");
    expect(store.getState().messages.map((m) => m.id)).toEqual(["u1"]);
  });

  it("rebuilds the turn from the replay, then commits it", async () => {
    const { store, transport, events } = setup({ t1: [user, running] });
    await store.actions.openThread("t1");
    const h = transport.lastStreamHandlers()!;
    h.onChunk?.("Hello, ");
    h.onChunk?.("world");
    h.onComplete?.(null);
    h.onDone?.();

    const s = store.getState();
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)?.content).toBe("Hello, world");
    expect(events.some((e) => e.type === "assistant-reply")).toBe(true);
  });

  it("never hands a replayed command to the host, but keeps its component", async () => {
    const { store, transport, events } = setup({ t1: [user, running] });
    await store.actions.openThread("t1");
    const h = transport.lastStreamHandlers()!;
    h.onCommandReplay?.({ type: "navigate", to: "/a" });
    h.onCommandReplay?.({
      command: "displayComponent",
      component: "Chart",
      props: { n: 1 },
    });

    expect(events.filter((e) => e.type === "command")).toEqual([]);
    expect(store.getState().stream?.components.length).toBe(1);
  });

  it("re-attaches when restoring the visitor's saved thread", async () => {
    const transport = makeFakeTransport({ messages: { t1: [user, running] } });
    const store = createChatStore({
      transport,
      config: resolveConfig({}),
      userId: "visitor-1",
      batch: "sync",
      turnPollMs: 0,
      session: { load: () => "t1", save: () => {}, clear: () => {} },
    });
    await store.actions.start();
    expect(streamCalls(transport).map((c) => c.args)).toEqual([["a1", STREAM_URL]]);
  });

  it("does nothing for a thread with no running turn", async () => {
    const done = row({ id: "a1", message_idx: 1, role: "assistant", content: "Hi", reasoning: "" });
    const { store, transport } = setup({ t1: [user, done] });
    await store.actions.openThread("t1");
    expect(streamCalls(transport)).toEqual([]);
    expect(store.getState().status).toBe("idle");
  });

  it("passes the send response's stream_url to the stream", async () => {
    const { store, transport } = setup({});
    await store.actions.send("hello");
    const [call] = streamCalls(transport);
    expect(call.args[1]).toMatch(/stream/);
  });
});
