/**
 * Display components in the Vue view: tool-requested UI rendered with what
 * the host registered, below the reply text.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";
import { defineComponent, h, type FunctionalComponent } from "vue";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import {
  displayComponentPropsOptions,
  lookupDisplayComponent,
  type ComponentListSlotProps,
  type DisplayComponentProps,
  type UraiChatDisplayComponents,
} from "../../src/ui";
import { DefaultComponentList } from "../../src/ui";
import { TOKEN, frame, mountChat, part, startTurn, waitFor } from "./helpers";

beforeEach(() => localStorage.clear());
enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

const OrderCard = defineComponent({
  props: displayComponentPropsOptions,
  setup(p) {
    return () =>
      h("div", { "data-testid": "order-card" }, [
        `Order ${String(p.props.orderId)}`,
        h(
          "button",
          { type: "button", onClick: () => p.sendMessage(`Cancel ${String(p.props.orderId)}`) },
          "Cancel",
        ),
      ]);
  },
});

const ORDER = { command: "displayComponent", component: "OrderCard", props: { orderId: "o-1" } };

async function turn(displayComponents: UraiChatDisplayComponents, extra: Record<string, unknown> = {}) {
  const transport = makeFakeTransport();
  const { wrapper } = mountChat({ transport, props: { displayComponents, ...extra } });
  const h0 = await startTurn(wrapper, transport, "where is my order?");
  return { transport, wrapper, h: h0 };
}

const card = () => document.querySelector<HTMLElement>('[data-testid="order-card"]');

describe("Vue view — display components", () => {
  it("renders a live component below the text and keeps it on the committed message", async () => {
    const onCommand = vi.fn();
    const { h: s } = await turn({ OrderCard }, { onCommand });
    s.onChunk?.("Here it is.");
    s.onCommand?.(ORDER);
    await frame();

    const list = part("component-list")!;
    expect(list.textContent).toContain("Order o-1");
    // Below the reply text, inside the same bubble.
    const bubble = list.closest(".urai-bubble")!;
    expect(bubble.textContent!.indexOf("Here it is.")).toBeLessThan(
      bubble.textContent!.indexOf("Order o-1"),
    );
    expect(list.closest('[data-state="streaming"]')).toBeTruthy();
    expect(onCommand).toHaveBeenCalledWith(ORDER);

    s.onDone?.();
    await frame();
    expect(card()!.closest('[data-state="streaming"]')).toBeNull();
    expect(card()!.textContent).toContain("Order o-1");
  });

  it("lets a component send a message as the visitor", async () => {
    const { transport, h: s } = await turn({ OrderCard });
    s.onCommand?.(ORDER);
    s.onDone?.();
    await frame();

    card()!.querySelector("button")!.click();
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
    mountChat({ transport, props: { fetchServerConfig: true, displayComponents: { OrderCard } } });
    await waitFor(() => expect(card()?.textContent).toContain("Order o-9"));
  });

  it("passes the tool's props as one object, never spread onto the component", async () => {
    const seen: Array<Record<string, unknown>> = [];
    // A functional component with no declared props sees everything passed.
    const Probe: FunctionalComponent<DisplayComponentProps> = (p) => {
      seen.push({ ...p });
      return h("div", { "data-testid": "probe" }, p.component);
    };
    const { h: s } = await turn({ Probe });
    s.onCommand?.({
      command: "displayComponent",
      component: "Probe",
      props: { class: "evil", style: "display:none", onClick: "x", key: "k", id: "pwn" },
    });
    await frame();

    const probe = document.querySelector<HTMLElement>('[data-testid="probe"]')!;
    expect(probe.textContent).toBe("Probe");
    expect(probe.className).toBe("");
    expect(probe.getAttribute("style")).toBeNull();
    expect(probe.id).toBe("");
    expect(Object.keys(seen[0]).sort()).toEqual(["component", "props", "sendMessage"]);
    expect(seen[0].props).toEqual({
      class: "evil",
      style: "display:none",
      onClick: "x",
      key: "k",
      id: "pwn",
    });
  });

  it("skips unregistered names and contains a component that throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("boom");
    };
    const BrokenSetup = defineComponent({
      setup() {
        throw new Error("setup boom");
      },
    });
    const { h: s } = await turn({ Broken, BrokenSetup, OrderCard });
    s.onChunk?.("still here");
    for (const component of ["Missing", "Broken", "BrokenSetup", "toString", "constructor"]) {
      s.onCommand?.({ command: "displayComponent", component });
    }
    s.onCommand?.(ORDER);
    await frame();

    expect(warn.mock.calls.some((c) => String(c[0]).includes('"Missing"'))).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('"constructor"'))).toBe(true);
    expect(error.mock.calls.some((c) => String(c[0]).includes('"Broken"'))).toBe(true);
    expect(error.mock.calls.some((c) => String(c[0]).includes('"BrokenSetup"'))).toBe(true);
    expect(document.body.textContent).toContain("still here");
    expect(card()).toBeTruthy();
    // Only the good card is left in the list.
    expect(part("component-list")!.children).toHaveLength(1);

    // And the committed message survives too.
    s.onDone?.();
    await frame();
    expect(document.body.textContent).toContain("still here");
    expect(card()).toBeTruthy();
  });

  it("can be restyled through the ComponentList slot", async () => {
    const ComponentList: FunctionalComponent<ComponentListSlotProps> = (p) =>
      h("section", { "data-testid": "my-list" }, [h(DefaultComponentList, p)]);
    const { h: s } = await turn({ OrderCard }, { components: { ComponentList } });
    s.onCommand?.(ORDER);
    await frame();
    expect(document.querySelector('[data-testid="my-list"] [data-testid="order-card"]')).toBeTruthy();
  });
});

describe("lookupDisplayComponent", () => {
  it("finds own properties only", () => {
    const registry = { OrderCard } as UraiChatDisplayComponents;
    expect(lookupDisplayComponent(registry, "OrderCard")).toBe(OrderCard);
    expect(lookupDisplayComponent(registry, "constructor")).toBeUndefined();
    expect(lookupDisplayComponent(registry, "toString")).toBeUndefined();
    expect(lookupDisplayComponent(registry, "__proto__")).toBeUndefined();
  });
});
