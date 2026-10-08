import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createSSRApp, defineComponent, h, type FunctionalComponent } from "vue";
import { renderToString } from "vue/server-renderer";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import {
  Chat,
  DefaultSendButton,
  UraiChat,
  type SendButtonSlotProps,
} from "../../src/ui";
import {
  TOKEN,
  frame,
  mountChat,
  part,
  ready,
  send,
  startTurn,
  stream,
  waitFor,
} from "./helpers";

beforeEach(() => {
  // The store persists the visitor's thread id, so without this a later
  // test auto-restores the previous one instead of creating a thread.
  localStorage.clear();
});
enableAutoUnmount(afterEach);

describe("UraiChat (Vue): mounting", () => {
  it("renders the default tree once the client mounts", async () => {
    const { wrapper } = mountChat();
    await ready(wrapper);
    expect(document.querySelector('[role="log"]')).toBeTruthy();
    expect(wrapper.find("textarea").exists()).toBe(true);
    expect(document.querySelectorAll('[data-urai-part="root"]')).toHaveLength(1);
  });

  it("closes the stream on unmount", async () => {
    const { wrapper, transport } = mountChat();
    await startTurn(wrapper, transport);
    wrapper.unmount();
    expect(transport.streamClosed()).toBe(true);
  });

  it("forwards class and style to the root element", async () => {
    const { wrapper } = mountChat({ props: { class: "host-chat", style: { height: "300px" } } });
    await ready(wrapper);
    const root = part("root")!;
    expect(root.className).toContain("urai-root");
    expect(root.className).toContain("host-chat");
    expect(root.style.height).toBe("300px");
  });
});

describe("UraiChat (Vue): client-only contract", () => {
  /**
   * Widget auth is (token, Origin ∈ allowed_origins) and a server-side
   * fetch carries no Origin, so a server render would silently 403 in
   * production. This is the regression guard on that.
   */
  it("server-renders only the fallback, with no network or storage access", async () => {
    const transport = makeFakeTransport();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const app = createSSRApp({
      render: () =>
        h(UraiChat, {
          widgetToken: TOKEN,
          userId: "visitor-1",
          transport,
          disableStyleInjection: true,
        }),
    });
    const html = await renderToString(app);
    expect(html).toContain('data-urai-part="fallback"');
    expect(html).not.toContain('data-urai-part="composer"');
    expect(transport.calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("UraiChat (Vue): composer", () => {
  it("sends on Enter and clears the draft", async () => {
    const { wrapper, transport } = mountChat();
    const box = await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    await frame();
    expect(box.value).toBe("");
    expect(document.body.textContent).toContain("hello");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const { wrapper, transport } = mountChat();
    await ready(wrapper);
    const box = wrapper.find("textarea");
    await box.setValue("line one\nline two");
    await box.trigger("keydown", { key: "Enter", shiftKey: true });
    await flushPromises();
    expect(transport.callNames()).not.toContain("sendMessage");
    expect((box.element as HTMLTextAreaElement).value).toContain("\n");
  });

  // Without the isComposing guard, Enter both commits the IME candidate
  // and sends — which makes the chat unusable in Japanese/Chinese/Korean.
  it("ignores Enter while an IME composition is active", async () => {
    const { wrapper, transport } = mountChat();
    const box = await ready(wrapper);
    await wrapper.find("textarea").setValue("にほん");
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(event, "isComposing", { value: true });
    box.dispatchEvent(event);
    await flushPromises();
    expect(transport.callNames()).not.toContain("sendMessage");
  });

  // Disabling the textarea mid-turn steals focus and blocks typing ahead.
  it("keeps the input enabled while a turn is in flight", async () => {
    const { wrapper, transport } = mountChat();
    const box = await ready(wrapper);
    await startTurn(wrapper, transport);
    expect(box.disabled).toBe(false);
  });
});

describe("UraiChat (Vue): streaming", () => {
  it("shows a thinking indicator until the first signal", async () => {
    const { wrapper, transport } = mountChat();
    await startTurn(wrapper, transport);
    await frame();
    expect(document.body.textContent).toContain("Thinking");

    stream(transport).onChunk?.("Hi there");
    await frame();
    expect(part("thinking")).toBeNull();
    expect(document.body.textContent).toContain("Hi there");
  });

  it("renders the reasoning disclosure and the tool activity row", async () => {
    const { wrapper, transport } = mountChat();
    const h0 = await startTurn(wrapper, transport);
    h0.onReasoning?.("weighing options");
    h0.onToolCallStarted?.({ id: "c1", fn_name: "web_search" });
    await frame();
    expect(part("reasoning")?.textContent).toContain("weighing options");
    expect(part("tool-activity")?.textContent).toContain("Searching the web…");
    const trigger = part("reasoning")!.querySelector("button")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBeTruthy();
  });

  it("commits the streamed turn into the transcript", async () => {
    const { wrapper, transport } = mountChat();
    const h0 = await startTurn(wrapper, transport);
    h0.onChunk?.("the answer");
    h0.onDone?.();
    await frame();
    expect(document.body.textContent).toContain("the answer");
    expect(part("thinking")).toBeNull();
    expect(document.querySelector('[data-state="streaming"]')).toBeNull();
  });

  /**
   * The test that protects the design rather than a behaviour: the store
   * keeps `messages` identity across tokens, so a settled row must not
   * re-render while the next turn streams.
   */
  it("does not re-render settled messages while a turn streams", async () => {
    const renders = { count: 0 };
    const CountingUserMessage: FunctionalComponent<{ message: { content: string } }> = (p) => {
      renders.count += 1;
      return h("li", p.message.content);
    };
    const { wrapper, transport } = mountChat({
      props: { components: { UserMessage: CountingUserMessage } },
    });
    await startTurn(wrapper, transport);
    await frame();

    const baseline = renders.count;
    expect(baseline).toBeGreaterThan(0);
    for (let i = 0; i < 50; i++) stream(transport).onChunk?.("tok ");
    await frame();
    expect(document.body.textContent).toMatch(/tok tok/);
    expect(renders.count).toBe(baseline);
  });
});

describe("UraiChat (Vue): customization", () => {
  it("replaces a part through the components map", async () => {
    const SendButton: FunctionalComponent<SendButtonSlotProps> = (p) =>
      h("button", p.buttonProps, "Beam it");
    const { wrapper } = mountChat({ props: { components: { SendButton } } });
    await ready(wrapper);
    const button = document.querySelector('button[aria-label="Send"]')!;
    expect(button.textContent).toBe("Beam it");
  });

  it("lets a wrapper reuse the default by passing its props through", async () => {
    const SendButton: FunctionalComponent<SendButtonSlotProps> = (p) =>
      h("span", { "data-testid": "wrapped" }, [h(DefaultSendButton, p)]);
    const { wrapper } = mountChat({ props: { components: { SendButton } } });
    await ready(wrapper);
    expect(document.querySelector('[data-testid="wrapped"]')).toBeTruthy();
    expect(document.querySelector('[data-urai-part="send-button"]')).toBeTruthy();
  });

  it("takes a named scoped slot as a part override", async () => {
    const { wrapper } = mountChat({
      slots: {
        SendButton: (p: SendButtonSlotProps) =>
          h("button", { ...p.buttonProps, "data-testid": "slot-send" }, "Go"),
        Footer: () => h("div", { "data-testid": "slot-footer" }, "Powered by us"),
      },
    });
    await ready(wrapper);
    expect(document.querySelector('[data-testid="slot-send"]')?.textContent).toBe("Go");
    expect(document.querySelector('[data-testid="slot-footer"]')?.textContent).toBe(
      "Powered by us",
    );
  });

  it("lets a named slot win over the components map", async () => {
    const { wrapper } = mountChat({
      props: { components: { Footer: () => h("div", "from components") } },
      slots: { Footer: () => h("div", "from slot") },
    });
    await ready(wrapper);
    expect(document.body.textContent).toContain("from slot");
    expect(document.body.textContent).not.toContain("from components");
  });

  it("renders pre-rendered VNode children in a replacement", async () => {
    const Composer = defineComponent({
      props: ["formProps", "input", "sendButton"],
      setup(p) {
        return () =>
          h("form", { ...p.formProps, "data-testid": "my-composer" }, [
            h(p.input),
            h(p.sendButton),
          ]);
      },
    });
    const { wrapper, transport } = mountChat({ props: { components: { Composer } } });
    await ready(wrapper);
    expect(document.querySelector('[data-testid="my-composer"] textarea')).toBeTruthy();
    await send(wrapper, "via custom composer");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
  });

  it("appends classNames rather than replacing the default class", async () => {
    const { wrapper } = mountChat({ props: { classNames: { composer: "my-composer" } } });
    await ready(wrapper);
    const composer = part("composer")!;
    expect(composer.className).toContain("urai-composer");
    expect(composer.className).toContain("my-composer");
  });

  it("drops default classes in unstyled mode but keeps the part hooks", async () => {
    const { wrapper } = mountChat({
      props: { unstyled: true, classNames: { composer: "mine", root: "my-root" } },
    });
    await ready(wrapper);
    const composer = part("composer")!;
    expect(composer.className).not.toContain("urai-composer");
    expect(composer.className).toContain("mine");
    expect(part("root")!.className).toBe("my-root");
  });

  it("takes labels over the defaults", async () => {
    const { wrapper } = mountChat({ props: { labels: { placeholder: "Ask us anything" } } });
    const box = await ready(wrapper);
    expect(box.placeholder).toBe("Ask us anything");
  });

  it("takes icons as components", async () => {
    const Send = () => h("i", { class: "my-send-icon" });
    const { wrapper } = mountChat({ props: { icons: { send: Send } } });
    await ready(wrapper);
    expect(part("send-button")!.querySelector(".my-send-icon")).toBeTruthy();
  });
});

describe("ChatRoot (Vue): recomposition", () => {
  it("renders a hand-built shell", async () => {
    const transport = makeFakeTransport();
    const wrapper = mount(Chat.Root, {
      props: {
        widgetToken: TOKEN,
        userId: "visitor-1",
        fetchServerConfig: false,
        transport,
        disableStyleInjection: true,
      },
      slots: {
        default: () => h("main", [h(Chat.MessageList), h(Chat.Composer)]),
      },
      attachTo: document.body,
    });
    await ready(wrapper);
    expect(document.querySelector('[role="log"]')).toBeTruthy();
    expect(part("header")).toBeNull();
  });

  it("throws a helpful error for a part outside the root", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => mount(Chat.Composer)).toThrow(/outside <ChatRoot>/);
  });
});

describe("UraiChat (Vue): accessibility", () => {
  it("marks the transcript as a log that does not announce every token", async () => {
    const { wrapper } = mountChat();
    await ready(wrapper);
    const log = document.querySelector('[role="log"]')!;
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("aria-label")).toBe("Conversation");
  });

  it("announces a streaming turn once, in a separate live region", async () => {
    const { wrapper, transport } = mountChat();
    const h0 = await startTurn(wrapper, transport);
    h0.onChunk?.("hi");
    await frame();
    const region = document.querySelector('.urai-sr-only[role="status"]')!;
    expect(region.textContent).toBe("Assistant is responding");
  });

  it("labels an error turn as an alert", async () => {
    const transport = makeFakeTransport({ fail: { sendMessage: new Error("503 unavailable") } });
    const { wrapper } = mountChat({ transport });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(document.querySelector('[role="alert"]')).toBeTruthy());
  });
});
