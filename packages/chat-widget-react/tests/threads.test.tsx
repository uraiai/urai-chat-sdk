import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import type { ServerMessage } from "@uraiai/chat-widget-core";
import { UraiChat, type UraiChatHandle } from "../src/ui";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const TOKEN = "11111111-2222-3333-4444-555555555555";

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

function transport(extra: { missingThreads?: string[] } = {}): FakeTransport {
  return makeFakeTransport({
    messages: { tA: [message("tA", "answer A")], tB: [message("tB", "answer B")] },
    ...extra,
  });
}

function chat(t: FakeTransport, props: Record<string, unknown> = {}) {
  return (
    <UraiChat
      widgetToken={TOKEN}
      userId="visitor-1"
      fetchServerConfig={false}
      transport={t}
      disableStyleInjection
      {...props}
    />
  );
}

describe("UraiChat: onThreadChange", () => {
  it("reports the created thread before the reply", async () => {
    const onThreadChange = vi.fn();
    const t = transport();
    render(chat(t, { onThreadChange }));
    await userEvent.type(await screen.findByRole("textbox"), "hello{Enter}");
    await waitFor(() =>
      expect(onThreadChange).toHaveBeenCalledWith("t1", {
        previousThreadId: null,
        reason: "created",
      }),
    );
  });

  it("exposes the id through the handle", async () => {
    const ref = createRef<UraiChatHandle>();
    const t = transport();
    render(chat(t, { ref, threadId: "tA" }));
    await screen.findByText("answer A");
    expect(ref.current?.getThreadId()).toBe("tA");
    expect((await ref.current?.getThreadSummary("tB"))?.title).toBe("Thread tB");
  });
});

describe("UraiChat: read-only", () => {
  it("shows the transcript with no composer or switcher, titled by the thread", async () => {
    const t = transport();
    render(chat(t, { threadId: "tA", readOnly: true }));
    await screen.findByText("answer A");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[data-urai-part="thread-trigger"]')).toBeNull();
    expect(screen.getByText("Thread tA")).toBeTruthy();
  });

  it("hides the welcome message", async () => {
    const t = transport();
    render(
      chat(t, {
        threadId: "tA",
        readOnly: true,
        labels: { welcomeMessage: "Hi there" },
      }),
    );
    await screen.findByText("answer A");
    expect(screen.queryByText("Hi there")).toBeNull();
  });

  it("says so when the thread is not the visitor's", async () => {
    const onError = vi.fn();
    const t = transport({ missingThreads: ["tX"] });
    render(chat(t, { threadId: "tX", readOnly: true, onError }));
    await screen.findByText("This conversation is unavailable.");
    expect(onError).toHaveBeenCalled();
  });

  it("loads a new threadId in place", async () => {
    const t = transport();
    const { rerender } = render(chat(t, { threadId: "tA", readOnly: true }));
    await screen.findByText("answer A");
    rerender(chat(t, { threadId: "tB", readOnly: true }));
    await screen.findByText("answer B");
    expect(screen.queryByText("answer A")).toBeNull();
    // Same client: no second config/start, just another open.
    expect(t.callNames().filter((n) => n === "listMessages")).toEqual([
      "listMessages",
      "listMessages",
    ]);
  });

  it("does not touch the visitor's saved thread", async () => {
    localStorage.setItem(
      "urai_chat_widget",
      JSON.stringify({ [TOKEN]: { "visitor-1": { thread_id: "tB" } } }),
    );
    const t = transport();
    render(chat(t, { threadId: "tA", readOnly: true }));
    await screen.findByText("answer A");
    expect(JSON.parse(localStorage.getItem("urai_chat_widget")!)).toEqual({
      [TOKEN]: { "visitor-1": { thread_id: "tB" } },
    });
  });
});
