import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { StrictMode, useEffect, useRef, type ReactNode } from "react";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat, Chat, DefaultSendButton } from "../src/ui";

beforeEach(() => {
  // The store persists the visitor's thread id, so without this a later
  // test auto-restores the previous one instead of creating a thread.
  localStorage.clear();
});

afterEach(cleanup);

const TOKEN = "11111111-2222-3333-4444-555555555555";

function mount(
  over: {
    transport?: FakeTransport;
    props?: Record<string, unknown>;
    children?: ReactNode;
  } = {},
) {
  const transport = over.transport ?? makeFakeTransport();
  const utils = render(
    <UraiChat
      widgetToken={TOKEN}
      userId="visitor-1"
      fetchServerConfig={false}
      transport={transport}
      disableStyleInjection
      {...over.props}
    />,
  );
  return { transport, ...utils };
}

/** The client is created in an effect, so wait for the composer to exist. */
async function ready() {
  await screen.findByRole("textbox");
}

function stream(t: FakeTransport) {
  const h = t.lastStreamHandlers();
  if (!h) throw new Error("no stream open");
  return h;
}

/**
 * Stream updates are coalesced to one notification per animation frame,
 * so a burst of tokens costs one render rather than N. Tests have to
 * await that frame — this is real behaviour, not a test artifact.
 */
async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

describe("UraiChat: mounting", () => {
  it("renders the default tree once the client mounts", async () => {
    mount();
    await ready();
    expect(screen.getByRole("log")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("mounts exactly one client under StrictMode", async () => {
    const transport = makeFakeTransport();
    render(
      <StrictMode>
        <UraiChat
          widgetToken={TOKEN}
          userId="visitor-1"
          fetchServerConfig={false}
          transport={transport}
          disableStyleInjection
        />
      </StrictMode>,
    );
    await ready();
    expect(document.querySelectorAll('[data-urai-part="root"]')).toHaveLength(1);
  });

  it("closes the stream on unmount", async () => {
    const { transport, unmount } = mount();
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
    unmount();
    expect(transport.streamClosed()).toBe(true);
  });
});

describe("UraiChat: client-only contract", () => {
  /**
   * Widget auth is (token, Origin ∈ allowed_origins) and a server-side
   * fetch carries no Origin, so a server render would silently 403 in
   * production. This is the regression guard on that.
   */
  it("server-renders only the fallback, with no network or storage access", () => {
    const transport = makeFakeTransport();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToString(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        transport={transport}
        disableStyleInjection
      />,
    );
    expect(html).toContain('data-urai-part="fallback"');
    expect(html).not.toContain('data-urai-part="composer"');
    expect(transport.calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("UraiChat: composer", () => {
  it("sends on Enter and clears the draft", async () => {
    const { transport } = mount();
    await ready();
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "hello{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("sendMessage"),
    );
    expect((box as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const { transport } = mount();
    await ready();
    const box = screen.getByRole("textbox");
    await userEvent.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(transport.callNames()).not.toContain("sendMessage");
    expect((box as HTMLTextAreaElement).value).toContain("\n");
  });

  // Without the isComposing guard, Enter both commits the IME candidate
  // and sends — which makes the widget unusable in Japanese/Chinese/Korean.
  it("ignores Enter while an IME composition is active", async () => {
    const { transport } = mount();
    await ready();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(box, "にほん");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    });
    Object.defineProperty(event, "isComposing", { value: true });
    await act(async () => {
      box.dispatchEvent(event);
    });
    expect(transport.callNames()).not.toContain("sendMessage");
  });

  // Disabling the textarea mid-turn steals focus and blocks typing ahead.
  it("keeps the input enabled while a turn is in flight", async () => {
    mount();
    await ready();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(box, "hello{Enter}");
    await waitFor(() => expect(box.disabled).toBe(false));
  });
});

describe("UraiChat: streaming", () => {
  it("shows a thinking indicator until the first signal", async () => {
    const { transport } = mount();
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
    expect(screen.getByText("Thinking")).toBeTruthy();

    await act(async () => stream(transport).onChunk?.("Hi there"));
    await frame();
    expect(screen.queryByText("Thinking")).toBeNull();
    expect(screen.getByText("Hi there")).toBeTruthy();
  });

  it("renders the reasoning disclosure and the tool activity row", async () => {
    const { transport } = mount();
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());

    await act(async () => {
      stream(transport).onReasoning?.("weighing options");
      stream(transport).onToolCallStarted?.({ id: "c1", fn_name: "web_search" });
    });
    await frame();
    expect(screen.getByText("weighing options")).toBeTruthy();
    expect(screen.getByText("Searching the web…")).toBeTruthy();
  });

  it("commits the streamed turn into the transcript", async () => {
    const { transport } = mount();
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
    await act(async () => {
      stream(transport).onChunk?.("the answer");
      stream(transport).onDone?.();
    });
    await frame();
    expect(screen.getByText("the answer")).toBeTruthy();
    // The turn is settled: no thinking indicator, no streaming row.
    expect(screen.queryByText("Thinking")).toBeNull();
    expect(document.querySelector('[data-state="streaming"]')).toBeNull();
  });

  /**
   * The test that protects the design rather than a behaviour: the store
   * keeps `messages` identity across tokens, so a settled row must not
   * re-render while the next turn streams. A careless selector six months
   * from now fails here.
   */
  it("does not re-render settled messages while a turn streams", async () => {
    const renders = { count: 0 };
    function CountingUserMessage(props: { message: { content: string } }) {
      renders.count += 1;
      return <li>{props.message.content}</li>;
    }
    const transport = makeFakeTransport();
    render(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
        components={{ UserMessage: CountingUserMessage as never }}
      />,
    );
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());

    const baseline = renders.count;
    await act(async () => {
      for (let i = 0; i < 50; i++) stream(transport).onChunk?.("tok ");
    });
    await frame();
    // The streaming row rendered; the settled user row did not.
    expect(screen.getByText(/tok tok/)).toBeTruthy();
    expect(renders.count).toBe(baseline);
  });
});

describe("UraiChat: customization", () => {
  it("replaces a part through the components map", async () => {
    mount({
      props: {
        components: {
          SendButton: (p: { buttonProps: Record<string, unknown> }) => (
            <button {...p.buttonProps}>Beam it</button>
          ),
        },
      },
    });
    await ready();
    expect(screen.getByRole("button", { name: "Send" }).textContent).toBe("Beam it");
  });

  it("lets a wrapper reuse the default by spreading its props", async () => {
    mount({
      props: {
        components: {
          SendButton: (p: never) => (
            <span data-testid="wrapped">
              <DefaultSendButton {...p} />
            </span>
          ),
        },
      },
    });
    await ready();
    expect(screen.getByTestId("wrapped")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("appends classNames rather than replacing the default class", async () => {
    mount({ props: { classNames: { composer: "my-composer" } } });
    await ready();
    const composer = document.querySelector('[data-urai-part="composer"]')!;
    expect(composer.className).toContain("urai-composer");
    expect(composer.className).toContain("my-composer");
  });

  it("drops default classes in unstyled mode but keeps the part hooks", async () => {
    mount({ props: { unstyled: true, classNames: { composer: "mine" } } });
    await ready();
    const composer = document.querySelector('[data-urai-part="composer"]')!;
    expect(composer.className).not.toContain("urai-composer");
    expect(composer.className).toContain("mine");
  });

  it("takes labels over the defaults", async () => {
    mount({ props: { labels: { placeholder: "Ask us anything" } } });
    await ready();
    expect(screen.getByPlaceholderText("Ask us anything")).toBeTruthy();
  });
});

describe("Chat.Root: recomposition", () => {
  it("renders a hand-built shell", async () => {
    const transport = makeFakeTransport();
    render(
      <Chat.Root
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
      >
        <main>
          <Chat.MessageList />
          <Chat.Composer />
        </main>
      </Chat.Root>,
    );
    await ready();
    expect(screen.getByRole("log")).toBeTruthy();
    expect(document.querySelector('[data-urai-part="header"]')).toBeNull();
  });
});

describe("UraiChat: accessibility", () => {
  it("marks the transcript as a log that does not announce every token", async () => {
    mount();
    await ready();
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("off");
    expect(log.getAttribute("aria-label")).toBe("Conversation");
  });

  it("labels an error turn as an alert", async () => {
    const transport = makeFakeTransport({
      fail: { sendMessage: new Error("503 unavailable") },
    });
    mount({ transport });
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
