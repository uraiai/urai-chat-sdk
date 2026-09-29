/**
 * Sub-agent cards in the React view: one per `delegate` call, below the
 * reply text, live and from history.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { UraiChat } from "../src/ui";

const TOKEN = "11111111-2222-3333-4444-555555555555";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function cards(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-urai-part="delegate"]'));
}

describe("React view — sub-agent cards", () => {
  it("shows a running card live, settles it, and keeps it after the turn", async () => {
    const transport = makeFakeTransport();
    const { container } = render(
      <UraiChat widgetToken={TOKEN} userId="visitor-1" transport={transport} open />,
    );
    await screen.findByRole("textbox");
    await userEvent.type(screen.getByRole("textbox"), "research{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
    const h = transport.lastStreamHandlers()!;

    await act(async () => {
      h.onToolCallStarted?.({ id: "c0", fn_name: "execute" });
      h.onToolCallStarted?.({ id: "c1", fn_name: "delegate", label: "Compare vendors" });
    });
    await frame();
    expect(cards(container)).toHaveLength(1);
    const running = cards(container)[0];
    expect(running.dataset.state).toBe("running");
    expect(running.textContent).toContain("Sub-agent");
    expect(running.textContent).toContain("Compare vendors");
    expect(running.textContent).toContain("Running");
    expect(running.querySelector("a")).toBeNull();

    await act(async () => {
      h.onToolCallCompleted?.({ id: "c1", ok: false, status: "failed" });
      h.onChunk?.("It did not work out.");
    });
    await frame();
    expect(cards(container)[0].dataset.state).toBe("failed");
    expect(cards(container)[0].textContent).toContain("Failed");

    await act(async () => h.onDone?.());
    await frame();
    expect(cards(container)).toHaveLength(1);
    expect(cards(container)[0].dataset.state).toBe("failed");
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
    const { container } = render(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        transport={transport}
        labels={{ subAgent: "Helper" }}
      />,
    );
    await waitFor(() => expect(cards(container)).toHaveLength(2));
    const [a, b] = cards(container);
    expect(a.textContent).toContain("Helper");
    expect(a.textContent).toContain("Done");
    expect(a.textContent).toContain("3 steps");
    expect(b.textContent).toContain("Stopped");
    expect(b.textContent).not.toContain("step");
    expect(
      container.querySelector('[data-urai-part="delegate-list"]')!.getAttribute("aria-label"),
    ).toBe("Sub-agents");
  });
});
