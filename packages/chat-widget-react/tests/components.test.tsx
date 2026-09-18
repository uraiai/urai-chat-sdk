/**
 * Display components in the React view: tool-requested UI rendered with
 * what the host registered, below the reply text.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat, type DisplayComponentProps, type UraiChatDisplayComponents } from "../src/ui";

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

function OrderCard({ props, sendMessage }: DisplayComponentProps<{ orderId: string }>) {
  return (
    <div data-testid="order-card">
      Order {props.orderId}
      <button type="button" onClick={() => sendMessage(`Cancel ${props.orderId}`)}>
        Cancel
      </button>
    </div>
  );
}

async function startTurn(transport: FakeTransport, displayComponents: UraiChatDisplayComponents) {
  const utils = render(
    <UraiChat
      widgetToken={TOKEN}
      userId="visitor-1"
      transport={transport}
      displayComponents={displayComponents}
    />,
  );
  await screen.findByRole("textbox");
  await userEvent.type(screen.getByRole("textbox"), "where is my order?{Enter}");
  await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
  return { ...utils, h: transport.lastStreamHandlers()! };
}

const ORDER = { command: "displayComponent", component: "OrderCard", props: { orderId: "o-1" } };

describe("React view — display components", () => {
  it("renders a live component below the text and keeps it on the committed message", async () => {
    const transport = makeFakeTransport();
    const onCommand = vi.fn();
    const utils = render(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        transport={transport}
        displayComponents={{ OrderCard }}
        onCommand={onCommand}
      />,
    );
    await screen.findByRole("textbox");
    await userEvent.type(screen.getByRole("textbox"), "where is my order?{Enter}");
    await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
    const h = transport.lastStreamHandlers()!;

    await act(async () => {
      h.onChunk?.("Here it is.");
      h.onCommand?.(ORDER);
    });
    await frame();

    const list = utils.container.querySelector('[data-urai-part="component-list"]')!;
    expect(list.textContent).toContain("Order o-1");
    // Below the reply text, inside the same bubble.
    const bubble = list.closest(".urai-bubble")!;
    expect(bubble.textContent!.indexOf("Here it is.")).toBeLessThan(
      bubble.textContent!.indexOf("Order o-1"),
    );
    expect(onCommand).toHaveBeenCalledWith(ORDER);

    await act(async () => h.onDone?.());
    await frame();
    expect(screen.getByTestId("order-card").closest('[data-state="streaming"]')).toBeNull();
    expect(screen.getByTestId("order-card").textContent).toContain("Order o-1");
  });

  it("lets a component send a message as the visitor", async () => {
    const transport = makeFakeTransport();
    const { h } = await startTurn(transport, { OrderCard });
    await act(async () => {
      h.onCommand?.(ORDER);
      h.onDone?.();
    });
    await frame();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        transport.calls.filter((c) => c.method === "sendMessage").map((c) => c.args[1]),
      ).toEqual(["where is my order?", "Cancel o-1"]),
    );
  });

  it("renders components from history", async () => {
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
            content: "",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
            components: [{ id: "c1", component: "OrderCard", props: { orderId: "o-9" } }],
          },
        ],
      },
    });
    render(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        transport={transport}
        displayComponents={{ OrderCard }}
      />,
    );
    expect((await screen.findByTestId("order-card")).textContent).toContain("Order o-9");
  });

  it("skips unregistered names and contains a component that throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("boom");
    };
    const transport = makeFakeTransport();
    const { container, h } = await startTurn(transport, { Broken, OrderCard });
    await act(async () => {
      h.onChunk?.("still here");
      for (const component of ["Missing", "Broken", "toString"]) {
        h.onCommand?.({ command: "displayComponent", component });
      }
      h.onCommand?.(ORDER);
    });
    await frame();

    expect(warn.mock.calls.some((c) => String(c[0]).includes('"Missing"'))).toBe(true);
    expect(container.textContent).toContain("still here");
    expect(screen.getByTestId("order-card")).toBeTruthy();
  });
});
