import { describe, it, expect } from "vitest";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import {
  createDelegateList,
  delegateCompletionStatus,
  delegateStatusLabel,
  delegateStepsLabel,
  isDelegateRunning,
} from "../../src/headless/delegates";
import { prettyToolName } from "../../src/headless/tool-activity";
import { commitStream, hydrateHistory } from "../../src/headless/messages";
import { createChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { MessageDelegate, ServerMessage } from "../../src/transport";

describe("createDelegateList", () => {
  it("starts empty", () => {
    expect(createDelegateList().snapshot()).toEqual([]);
  });

  it("adds a running card only for delegate calls", () => {
    const d = createDelegateList();
    expect(d.start({ id: "c1", fn_name: "execute" })).toBe(false);
    expect(d.start({ id: "c2", fn_name: "delegate", label: "Summarise the Q3 report" })).toBe(
      true,
    );
    expect(d.snapshot()).toEqual([
      { id: "c2", label: "Summarise the Q3 report", status: "running", steps: 0 },
    ]);
  });

  it("keeps only the label's first line", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate", label: "\n  Find the invoice  \nthen email it" });
    expect(d.snapshot()[0].label).toBe("Find the invoice");
  });

  it("tolerates a missing label", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate" });
    expect(d.snapshot()[0].label).toBe("");
  });

  it("ignores a repeated start for a known id", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate", label: "a" });
    d.complete({ id: "c1", ok: true, status: "completed" });
    expect(d.start({ id: "c1", fn_name: "delegate", label: "b" })).toBe(false);
    expect(d.snapshot()).toEqual([{ id: "c1", label: "a", status: "completed", steps: 0 }]);
  });

  it("settles a card with the completion's status", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate", label: "one" });
    d.start({ id: "c2", fn_name: "delegate", label: "two" });
    expect(d.complete({ id: "c2", ok: false, status: "timeout" })).toBe(true);
    expect(d.snapshot().map((c) => c.status)).toEqual(["running", "timeout"]);
  });

  it("ignores completions of other tools", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate", label: "one" });
    expect(d.complete({ id: "x", ok: true })).toBe(false);
    expect(d.snapshot()[0].status).toBe("running");
  });

  it("seeds from history in order, and a live completion can settle a seeded card", () => {
    const seed: MessageDelegate[] = [
      { id: "a", label: "first", status: "completed", steps: 4 },
      { id: "b", label: "second", status: "running", steps: 0 },
    ];
    const d = createDelegateList(seed);
    expect(d.snapshot()).toEqual(seed);
    d.complete({ id: "b", ok: true, status: "no_output" });
    expect(d.snapshot()[1].status).toBe("no_output");
    // The seed is not mutated.
    expect(seed[1].status).toBe("running");
  });

  it("returns fresh objects from every snapshot", () => {
    const d = createDelegateList();
    d.start({ id: "c1", fn_name: "delegate", label: "one" });
    const a = d.snapshot();
    d.complete({ id: "c1", ok: true, status: "completed" });
    expect(a[0].status).toBe("running");
    expect(d.snapshot()).not.toBe(a);
  });
});

describe("delegateCompletionStatus", () => {
  it("uses a known status", () => {
    for (const s of ["completed", "no_output", "failed", "timeout", "cancelled"]) {
      expect(delegateCompletionStatus({ ok: s === "completed", status: s })).toBe(s);
    }
  });

  it("falls back on ok when the status is missing or unknown", () => {
    expect(delegateCompletionStatus({ ok: false })).toBe("error");
    expect(delegateCompletionStatus({ ok: true })).toBe("completed");
    expect(delegateCompletionStatus({ ok: false, status: "exploded" })).toBe("error");
    expect(delegateCompletionStatus({ ok: true, status: "running" })).toBe("completed");
  });
});

describe("delegate labels", () => {
  it("names every status", () => {
    expect(delegateStatusLabel("running")).toBe("Running");
    expect(delegateStatusLabel("completed")).toBe("Done");
    expect(delegateStatusLabel("no_output")).toBe("No result file");
    expect(delegateStatusLabel("failed")).toBe("Failed");
    expect(delegateStatusLabel("timeout")).toBe("Timed out");
    expect(delegateStatusLabel("cancelled")).toBe("Stopped");
    expect(delegateStatusLabel("error")).toBe("Error");
  });

  it("shows a step count only when known", () => {
    expect(delegateStepsLabel(0)).toBeNull();
    expect(delegateStepsLabel(1)).toBe("1 step");
    expect(delegateStepsLabel(7)).toBe("7 steps");
  });

  it("reports running", () => {
    expect(isDelegateRunning({ status: "running" })).toBe(true);
    expect(isDelegateRunning({ status: "failed" })).toBe(false);
  });

  it("gives the delegate tool a pretty activity name", () => {
    expect(prettyToolName("delegate")).toBe("Delegating to a sub-agent");
  });
});

function assistant(over: Partial<ServerMessage>): ServerMessage {
  return {
    id: "m1",
    thread_id: "t1",
    message_idx: 1,
    role: "assistant",
    content: "",
    reasoning: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("hydrateHistory / commitStream: delegates", () => {
  it("carries delegates onto the row, and keeps a delegates-only turn", () => {
    const rows = hydrateHistory([
      assistant({
        id: "m1",
        content: "Done.",
        delegates: [{ id: "c1", label: "task", status: "completed", steps: 3 }],
      }),
      assistant({
        id: "m2",
        delegates: [{ id: "c2", label: "other", status: "failed", steps: 1 }],
      }),
      assistant({ id: "m3", delegates: null }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(rows[0].delegates).toEqual([
      { id: "c1", label: "task", status: "completed", steps: 3 },
    ]);
  });

  it("leaves delegates undefined when there are none", () => {
    const [row] = hydrateHistory([assistant({ content: "hi" })]);
    expect(row.delegates).toBeUndefined();
    expect(
      commitStream({
        messageId: "a1",
        content: "x",
        reasoning: null,
        tool: null,
        files: [],
        components: [],
        delegates: [],
        attached: true,
      }).delegates,
    ).toBeUndefined();
  });
});

describe("store: delegates", () => {
  function makeStore() {
    const transport = makeFakeTransport();
    const store = createChatStore({
      transport,
      config: resolveConfig({}),
      userId: "visitor-1",
      emit: () => {},
      batch: "sync",
    });
    return { store, transport: transport as FakeTransport };
  }

  it("builds cards from the live turn and commits them", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("research this");
    const h = transport.lastStreamHandlers()!;

    h.onToolCallStarted?.({ id: "c0", fn_name: "execute" });
    h.onToolCallStarted?.({ id: "c1", fn_name: "delegate", label: "Look up prices" });
    expect(store.getState().stream).toMatchObject({
      attached: true,
      delegates: [{ id: "c1", label: "Look up prices", status: "running", steps: 0 }],
    });

    h.onToolCallCompleted?.({ id: "c0", ok: true });
    h.onToolCallCompleted?.({ id: "c1", ok: false, status: "cancelled" });
    expect(store.getState().stream?.delegates[0].status).toBe("cancelled");

    h.onChunk?.("Here is what I found.");
    h.onDone?.();
    expect(store.getState().messages.at(-1)!.delegates).toEqual([
      { id: "c1", label: "Look up prices", status: "cancelled", steps: 0 },
    ]);
  });

  it("commits no delegates for a turn without any", async () => {
    const { store, transport } = makeStore();
    await store.actions.send("hi");
    const h = transport.lastStreamHandlers()!;
    h.onToolCallStarted?.({ id: "c0", fn_name: "web_search" });
    h.onChunk?.("hello");
    h.onDone?.();
    expect(store.getState().messages.at(-1)!.delegates).toBeUndefined();
  });
});
