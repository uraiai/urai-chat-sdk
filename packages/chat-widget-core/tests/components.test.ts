import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import type { ComponentRenderers } from "../src/ui";
import {
  FakeEventSource,
  flushAsync,
  installFakeEventSource,
  installFakeFetch,
} from "@uraiai/chat-test-support";

/**
 * Rich components in the imperative widget. The renderer draws into the
 * host element's light DOM, projected into the closed shadow root through
 * a named slot — so the root is captured as it is attached.
 */

const TOKEN = "11111111-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";
const API = `/api/widget/v1/${TOKEN}`;

let shadow: ShadowRoot | null = null;

function routes(extra: Record<string, (init?: RequestInit) => unknown> = {}) {
  return {
    [`GET ${API}/config`]: () => ({
      widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
      assistant: { id: "a1", name: "Bot", description: null },
    }),
    [`GET ${API}/threads`]: () => [],
    [`POST ${API}/threads`]: () => ({ thread_id: "t1", created: true }),
    [`POST ${API}/threads/t1/messages`]: () => ({
      user_message_id: "u1",
      assistant_message_id: "a1",
      thread_id: "t1",
      stream_url: "/ignored",
    }),
    ...extra,
  };
}

function orderCard() {
  const cleanup = vi.fn();
  const render = vi.fn((el: HTMLElement, props: Record<string, unknown>) => {
    el.textContent = `Order ${String(props.orderId)}`;
    return cleanup;
  });
  return { render, cleanup };
}

async function mount(displayComponents: ComponentRenderers) {
  const w = createUraiChatWidget({
    widgetToken: TOKEN,
    userId: "visitor-1",
    baseUrl: BASE,
    displayComponents,
  });
  await w.ready;
  w.open();
  return w;
}

function host(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-urai-chat-widget]")!;
}

beforeEach(() => {
  localStorage.clear();
  installFakeEventSource();
  shadow = null;
  const attach = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, "attachShadow").mockImplementation(function (
    this: HTMLElement,
    init: ShadowRootInit,
  ) {
    shadow = attach.call(this, init);
    return shadow;
  });
});

afterEach(() => {
  document.querySelectorAll("[data-urai-chat-widget]").forEach((el) => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("widget: display components", () => {
  it("renders a streamed component into light DOM, slotted into the reply", async () => {
    installFakeFetch(routes());
    const card = orderCard();
    const w = await mount({ OrderCard: card.render });
    const commands: unknown[] = [];
    w.on("command", (e) => e.type === "command" && commands.push(e.command));
    w.sendMessage("where is my order?");
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("message", "Here it is.");
    const payload = {
      command: "displayComponent",
      component: "OrderCard",
      props: { orderId: "o-1" },
    };
    es.dispatch("command", JSON.stringify(payload));

    expect(card.render).toHaveBeenCalledTimes(1);
    const [el, props, ctx] = card.render.mock.calls[0] as unknown as [
      HTMLElement,
      Record<string, unknown>,
      { component: string },
    ];
    expect(props).toEqual({ orderId: "o-1" });
    expect(ctx.component).toBe("OrderCard");
    // Light DOM, so host-page CSS and framework apps reach it…
    expect(el.parentElement).toBe(host());
    expect(el.dataset.uraiComponent).toBe("OrderCard");
    expect(el.textContent).toBe("Order o-1");
    // …projected into the reply bubble, below the text.
    const slot = shadow!.querySelector<HTMLSlotElement>(".ucw-assistant .ucw-components slot")!;
    expect(slot.name).toBe(el.slot);
    // The host still receives the command.
    expect(commands).toEqual([payload]);
  });

  it("lets a component send a message as the visitor", async () => {
    const { calls } = installFakeFetch(routes());
    let send: ((text: string) => void) | null = null;
    const w = await mount({
      Confirm: (el, _props, ctx) => {
        const button = document.createElement("button");
        button.textContent = "Confirm";
        button.addEventListener("click", () => ctx.sendMessage("Yes, cancel it"));
        el.appendChild(button);
        send = ctx.sendMessage;
      },
    });
    w.sendMessage("cancel my order");
    await flushAsync();
    const es = FakeEventSource.last()!;
    es.dispatch("command", JSON.stringify({ command: "displayComponent", component: "Confirm" }));
    es.dispatch("complete", JSON.stringify({ content: "Confirm below." }));
    await flushAsync();
    expect(send).not.toBeNull();

    host().querySelector<HTMLButtonElement>("[data-urai-component] button")!.click();
    await flushAsync();

    const sent = calls
      .filter((c) => c.method === "POST" && c.pathname.endsWith("/messages"))
      .map((c) => JSON.parse(String(c.init?.body)).content);
    expect(sent).toEqual(["cancel my order", "Yes, cancel it"]);
  });

  it("renders history components and cleans them up on reset", async () => {
    localStorage.setItem(
      "urai_chat_widget",
      JSON.stringify({ [TOKEN]: { "visitor-1": { thread_id: "t1" } } }),
    );
    installFakeFetch(
      routes({
        [`GET ${API}/threads/t1/messages`]: () => [
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
      }),
    );
    const card = orderCard();
    const w = await mount({ OrderCard: card.render });
    await flushAsync();

    // Mount and open() can both restore history; a re-render disposes the
    // previous one, so exactly one element is ever live.
    const mounted = host().querySelectorAll("[data-urai-component]");
    expect(mounted).toHaveLength(1);
    expect(mounted[0].textContent).toBe("Order o-9");
    expect(card.cleanup).toHaveBeenCalledTimes(card.render.mock.calls.length - 1);

    w.reset();
    expect(card.cleanup).toHaveBeenCalledTimes(card.render.mock.calls.length);
    expect(host().querySelector("[data-urai-component]")).toBeNull();
  });

  it("skips an unregistered name, warning once, and contains a renderer that throws", async () => {
    installFakeFetch(routes());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = await mount({
      Broken: () => {
        throw new Error("boom");
      },
    });
    w.sendMessage("hi");
    await flushAsync();
    const es = FakeEventSource.last()!;
    for (const component of ["Missing", "Missing", "Broken", "constructor"]) {
      es.dispatch("command", JSON.stringify({ command: "displayComponent", component }));
    }
    es.dispatch("message", "still here");

    expect(warn.mock.calls.filter((c) => String(c[0]).includes('"Missing"'))).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    expect(host().querySelector("[data-urai-component]")).toBeNull();
    expect(shadow!.querySelector(".ucw-components")).toBeNull();
    const bubbles = shadow!.querySelectorAll(".ucw-assistant");
    expect(bubbles[bubbles.length - 1].textContent).toContain("still here");
  });
});
