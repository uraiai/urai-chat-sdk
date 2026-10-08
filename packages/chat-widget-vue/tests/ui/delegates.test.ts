/**
 * Sub-agent cards in the Vue view: one per `delegate` call, below the reply
 * text, live and from history.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { TOKEN, frame, mountChat, startTurn, waitFor } from "./helpers";

beforeEach(() => localStorage.clear());
enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

function cards() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-urai-part="delegate"]'));
}

describe("Vue view — sub-agent cards", () => {
  it("shows a running card live, settles it, and keeps it after the turn", async () => {
    const transport = makeFakeTransport();
    const { wrapper } = mountChat({ transport });
    const h = await startTurn(wrapper, transport, "research");

    h.onToolCallStarted?.({ id: "c0", fn_name: "execute" });
    h.onToolCallStarted?.({ id: "c1", fn_name: "delegate", label: "Compare vendors" });
    await frame();
    expect(cards()).toHaveLength(1);
    const running = cards()[0];
    expect(running.dataset.state).toBe("running");
    expect(running.textContent).toContain("Sub-agent");
    expect(running.textContent).toContain("Compare vendors");
    expect(running.textContent).toContain("Running");
    expect(running.querySelector("a")).toBeNull();

    h.onToolCallCompleted?.({ id: "c1", ok: false, status: "failed" });
    h.onChunk?.("It did not work out.");
    await frame();
    expect(cards()[0].dataset.state).toBe("failed");
    expect(cards()[0].textContent).toContain("Failed");

    h.onDone?.();
    await frame();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].dataset.state).toBe("failed");
  });

  it("renders history cards with steps, and honours label overrides", async () => {
    localStorage.setItem(
      "urai_chat_widget",
      JSON.stringify({ [TOKEN]: { "visitor-1": { thread_id: "t1" } } }),
    );
    const transport = makeFakeTransport({
      messages: {
        t1: [
          {
            id: "m1",
            thread_id: "t1",
            message_idx: 1,
            role: "assistant",
            content: "Done.",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
            delegates: [
              { id: "c1", label: "First task", status: "completed", steps: 3 },
              { id: "c2", label: "Second task", status: "cancelled", steps: 0 },
            ],
          },
        ],
      },
    });
    mountChat({ transport, props: { fetchServerConfig: true, labels: { subAgent: "Helper" } } });
    await waitFor(() => expect(cards()).toHaveLength(2));
    const [a, b] = cards();
    expect(a.textContent).toContain("Helper");
    expect(a.textContent).toContain("Done");
    expect(a.textContent).toContain("3 steps");
    expect(b.textContent).toContain("Stopped");
    expect(b.textContent).not.toContain("step");
    expect(
      document.querySelector('[data-urai-part="delegate-list"]')!.getAttribute("aria-label"),
    ).toBe("Sub-agents");
  });
});
