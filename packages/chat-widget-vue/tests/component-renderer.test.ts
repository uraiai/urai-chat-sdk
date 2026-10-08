import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, inject, onUnmounted } from "vue";
import {
  FakeEventSource,
  flushAsync,
  installFakeEventSource,
  installFakeFetch,
} from "@uraiai/chat-test-support";
import { UraiChatWidget, vueComponentRenderer, vueComponentRenderers } from "../src/index";
import { displayComponentPropsOptions } from "../src/ui";

const TOKEN = "11111111-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";

const unmounted = vi.fn();

const OrderCard = defineComponent({
  props: displayComponentPropsOptions,
  setup(p) {
    const greeting = inject<string>("greeting", "none");
    onUnmounted(unmounted);
    return () =>
      h("div", { class: "order-card" }, [
        h("strong", `Order ${String(p.props.orderId)}`),
        h("em", `${p.component}/${greeting}`),
        h("button", { onClick: () => p.sendMessage(`Cancel ${String(p.props.orderId)}`) }, "Cancel"),
      ]);
  },
});

function context() {
  return { component: "OrderCard", sendMessage: vi.fn() };
}

afterEach(() => {
  unmounted.mockClear();
  document.body.innerHTML = "";
});

describe("vueComponentRenderer", () => {
  it("mounts the component with { props, component, sendMessage } and unmounts on cleanup", () => {
    const el = document.createElement("div");
    const ctx = context();
    const cleanup = vueComponentRenderer(OrderCard)(el, { orderId: "o-1" }, ctx);

    expect(el.querySelector("strong")?.textContent).toBe("Order o-1");
    expect(el.querySelector("em")?.textContent).toBe("OrderCard/none");
    el.querySelector("button")!.click();
    expect(ctx.sendMessage).toHaveBeenCalledWith("Cancel o-1");

    expect(typeof cleanup).toBe("function");
    (cleanup as () => void)();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(el.innerHTML).toBe("");
  });

  it("never spreads tool props onto the component", () => {
    const el = document.createElement("div");
    vueComponentRenderer(OrderCard)(el, { orderId: "o-2", class: "evil", id: "pwn" }, context());
    const root = el.querySelector(".order-card")!;
    expect(root.className).toBe("order-card");
    expect(root.id).toBe("");
  });

  it("lets the host configure each app through setup(app)", () => {
    const el = document.createElement("div");
    const setup = vi.fn((app) => app.provide("greeting", "from-setup"));
    vueComponentRenderer(OrderCard, { setup })(el, { orderId: "o-3" }, context());
    expect(setup).toHaveBeenCalledTimes(1);
    expect(el.querySelector("em")?.textContent).toBe("OrderCard/from-setup");
  });

  it("renders into an existing app's context when given appContext", () => {
    const hostApp = createApp({ render: () => null });
    hostApp.provide("greeting", "from-host-app");
    const el = document.createElement("div");
    const cleanup = vueComponentRenderer(OrderCard, { appContext: hostApp._context })(
      el,
      { orderId: "o-4" },
      context(),
    ) as () => void;
    expect(el.querySelector("em")?.textContent).toBe("OrderCard/from-host-app");
    cleanup();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(el.innerHTML).toBe("");
  });

  it("converts a whole map with vueComponentRenderers", () => {
    const renderers = vueComponentRenderers({ OrderCard });
    expect(Object.keys(renderers)).toEqual(["OrderCard"]);
    const el = document.createElement("div");
    renderers.OrderCard(el, { orderId: "o-5" }, context());
    expect(el.textContent).toContain("Order o-5");
  });
});

describe("vueComponentRenderer with <UraiChatWidget>", () => {
  beforeEach(() => {
    localStorage.clear();
    installFakeEventSource();
    installFakeFetch({
      [`GET /api/widget/v1/${TOKEN}/config`]: () => ({
        widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
        assistant: { id: "a1", name: "Bot", description: null },
      }),
      [`GET /api/widget/v1/${TOKEN}/threads`]: () => [],
      [`POST /api/widget/v1/${TOKEN}/threads`]: () => ({ thread_id: "t1", created: true }),
      [`POST /api/widget/v1/${TOKEN}/threads/t1/messages`]: () => ({
        user_message_id: "u1",
        assistant_message_id: "a1",
        thread_id: "t1",
        stream_url: "/ignored",
      }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders a Vue component for a displayComponent command", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: {
        widgetToken: TOKEN,
        userId: "v1",
        baseUrl: BASE,
        displayComponents: { OrderCard: vueComponentRenderer(OrderCard) },
      },
    });
    await flushAsync();
    const controller = (
      wrapper.vm as unknown as { controller: { open(): void; sendMessage(c: string): void } }
    ).controller;
    controller.open();
    controller.sendMessage("hi");
    await flushAsync();

    FakeEventSource.last()!.dispatch(
      "command",
      JSON.stringify({ command: "displayComponent", component: "OrderCard", props: { orderId: "o-1" } }),
    );
    const host = document.querySelector("[data-urai-chat-widget]")!;
    expect(host.querySelector("[data-urai-component] strong")?.textContent).toBe("Order o-1");

    wrapper.unmount();
    expect(unmounted).toHaveBeenCalledTimes(1);
  });
});
