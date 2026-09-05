import { describe, it, expect } from "vitest";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import type { ChatTransport } from "../../src/headless/transport-port";

/**
 * A smoke test for the fake itself. It is the substrate the whole
 * headless suite will run on from the next phase, and it needs no
 * globals — no `fetch` stub, no `EventSource` stub — which is what this
 * file is really asserting.
 */
describe("makeFakeTransport", () => {
  it("satisfies the ChatTransport port", () => {
    const t: ChatTransport = makeFakeTransport();
    expect(typeof t.streamMessage).toBe("function");
  });

  it("records calls in order with their arguments", async () => {
    const t = makeFakeTransport();
    const thread = await t.createOrResumeThread({ force_new: true });
    await t.sendMessage(thread.thread_id, "hello");
    expect(t.callNames()).toEqual(["createOrResumeThread", "sendMessage"]);
    expect(t.calls[0].args[0]).toEqual({ force_new: true });
    expect(t.calls[1].args[1]).toBe("hello");
  });

  it("hands back the stream handlers and reports teardown", () => {
    const t = makeFakeTransport();
    const close = t.streamMessage("a1", { onChunk: () => {} });
    expect(t.lastStreamHandlers()?.onChunk).toBeTypeOf("function");
    expect(t.streamClosed()).toBe(false);
    close();
    expect(t.streamClosed()).toBe(true);
  });

  it("serves seeded threads and messages", async () => {
    const t = makeFakeTransport({
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
      messages: {
        t1: [
          {
            id: "m1",
            thread_id: "t1",
            message_idx: 0,
            role: "user",
            content: "hi",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    expect((await t.listThreads())[0].title).toBe("Refund");
    expect((await t.listMessages("t1"))[0].content).toBe("hi");
    expect(await t.listMessages("nope")).toEqual([]);
  });

  it("throws from a method configured to fail", async () => {
    const t = makeFakeTransport({ fail: { listThreads: new Error("boom") } });
    await expect(t.listThreads()).rejects.toThrow("boom");
  });

  it("tracks the visitor id through setWidgetUserId", () => {
    const t = makeFakeTransport();
    t.setWidgetUserId("visitor-9");
    expect(t.widgetUserId).toBe("visitor-9");
  });
});
