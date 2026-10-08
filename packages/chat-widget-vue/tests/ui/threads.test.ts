import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import type { ServerMessage } from "@uraiai/chat-widget-core";
import { UraiChat, type UraiChatHandle } from "../../src/ui";
import { TOKEN, mountChat, part, ready, send, waitFor } from "./helpers";

beforeEach(() => localStorage.clear());
enableAutoUnmount(afterEach);

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

const text = () => document.body.textContent ?? "";

describe("UraiChat (Vue): thread-change", () => {
  it("reports the created thread before the reply", async () => {
    const onThreadChange = vi.fn();
    const { wrapper } = mountChat({ transport: transport(), props: { onThreadChange } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() =>
      expect(onThreadChange).toHaveBeenCalledWith("t1", {
        previousThreadId: null,
        reason: "created",
      }),
    );
    expect(wrapper.emitted("thread-change")?.[0]).toEqual([
      "t1",
      { previousThreadId: null, reason: "created" },
    ]);
  });

  it("exposes the id through the handle", async () => {
    const chat = ref<UraiChatHandle | null>(null);
    const t = transport();
    const Host = defineComponent({
      setup: () => () =>
        h(UraiChat, {
          ref: chat,
          widgetToken: TOKEN,
          userId: "visitor-1",
          fetchServerConfig: false,
          transport: t,
          disableStyleInjection: true,
          threadId: "tA",
        }),
    });
    mount(Host, { attachTo: document.body });
    await waitFor(() => expect(text()).toContain("answer A"));
    expect(chat.value?.getThreadId()).toBe("tA");
    expect((await chat.value?.getThreadSummary("tB"))?.title).toBe("Thread tB");
  });
});

describe("UraiChat (Vue): read-only", () => {
  it("shows the transcript with no composer or switcher, titled by the thread", async () => {
    mountChat({ transport: transport(), props: { threadId: "tA", readOnly: true } });
    await waitFor(() => expect(text()).toContain("answer A"));
    expect(document.querySelector("textarea")).toBeNull();
    expect(part("thread-trigger")).toBeNull();
    await waitFor(() => expect(part("header")?.textContent).toContain("Thread tA"));
  });

  it("hides the welcome message", async () => {
    mountChat({
      transport: transport(),
      props: { threadId: "tA", readOnly: true, labels: { welcomeMessage: "Hi there" } },
    });
    await waitFor(() => expect(text()).toContain("answer A"));
    expect(text()).not.toContain("Hi there");
  });

  it("says so when the thread is not the visitor's", async () => {
    const onError = vi.fn();
    mountChat({
      transport: transport({ missingThreads: ["tX"] }),
      props: { threadId: "tX", readOnly: true, onError },
    });
    await waitFor(() => expect(text()).toContain("This conversation is unavailable."));
    expect(onError).toHaveBeenCalled();
  });

  it("loads a new threadId in place", async () => {
    const t = transport();
    const { wrapper } = mountChat({ transport: t, props: { threadId: "tA", readOnly: true } });
    await waitFor(() => expect(text()).toContain("answer A"));
    await wrapper.setProps({ threadId: "tB" });
    await waitFor(() => expect(text()).toContain("answer B"));
    expect(text()).not.toContain("answer A");
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
    mountChat({ transport: transport(), props: { threadId: "tA", readOnly: true } });
    await waitFor(() => expect(text()).toContain("answer A"));
    expect(JSON.parse(localStorage.getItem("urai_chat_widget")!)).toEqual({
      [TOKEN]: { "visitor-1": { thread_id: "tB" } },
    });
  });
});

describe("UraiChat (Vue): thread switcher", () => {
  it("lists the visitor's threads and opens one", async () => {
    const t = makeFakeTransport({
      threads: [
        {
          id: "tA",
          title: "Billing question",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: new Date().toISOString(),
          last_message_at: null,
          last_message_preview: "about my invoice",
        },
      ],
      messages: { tA: [message("tA", "answer A")] },
    });
    const { wrapper } = mountChat({ transport: t });
    await ready(wrapper);
    const trigger = part("thread-trigger")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.click();
    await waitFor(() => expect(part("thread-item")?.textContent).toContain("Billing question"));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(t.callNames()).toContain("listThreads");

    part("thread-item")!.click();
    await waitFor(() => expect(text()).toContain("answer A"));
    // Picking a thread closes the switcher.
    expect(part("thread-switcher")).toBeNull();
  });
});
