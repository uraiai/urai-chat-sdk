import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { UraiChatWidget } from "../src/index";
import {
  FakeEventSource,
  installFakeEventSource,
  installFakeFetch,
  flushAsync,
} from "@uraiai/chat-test-support";

const TOKEN = "11111111-2222-3333-4444-555555555555";
const TOKEN2 = "99999999-2222-3333-4444-555555555555";
const BASE = "https://chat.example.com";

function widgetRoutes(token: string) {
  return {
    [`GET /api/widget/v1/${token}/config`]: () => ({
      widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
      assistant: { id: "a1", name: "Bot", description: null },
    }),
    [`GET /api/widget/v1/${token}/threads`]: () => [],
    [`POST /api/widget/v1/${token}/threads`]: () => ({
      thread_id: "t1",
      created: true,
    }),
    [`POST /api/widget/v1/${token}/threads/t1/messages`]: () => ({
      user_message_id: "u1",
      assistant_message_id: "a1",
      thread_id: "t1",
      stream_url: "/ignored",
    }),
  };
}

function threadRoutes(token: string) {
  const history = (id: string) => [
    {
      id: `${id}-m`,
      thread_id: id,
      message_idx: 0,
      role: "assistant",
      content: `answer ${id}`,
      reasoning: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const summary = (id: string) => ({
    id,
    title: `Thread ${id}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_message_at: null,
    last_message_preview: null,
  });
  return {
    ...widgetRoutes(token),
    [`GET /api/widget/v1/${token}/threads/tA/messages`]: () => history("tA"),
    [`GET /api/widget/v1/${token}/threads/tA`]: () => summary("tA"),
    [`GET /api/widget/v1/${token}/threads/tB/messages`]: () => history("tB"),
    [`GET /api/widget/v1/${token}/threads/tB`]: () => summary("tB"),
  };
}

function hosts(): Element[] {
  return Array.from(document.querySelectorAll("[data-urai-chat-widget]"));
}

beforeEach(() => {
  localStorage.clear();
  installFakeEventSource();
  installFakeFetch({ ...widgetRoutes(TOKEN), ...widgetRoutes(TOKEN2) });
});

afterEach(() => {
  hosts().forEach((el) => el.remove());
  vi.unstubAllGlobals();
});

describe("UraiChatWidget (Vue)", () => {
  it("mounts one widget and destroys it on unmount", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    wrapper.unmount();
    expect(hosts()).toHaveLength(0);
  });

  it("applies theme changes live without remounting", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    const host = hosts()[0];

    await wrapper.setProps({ theme: { primaryColor: "#ff0000" } });
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).toBe(host);
    wrapper.unmount();
  });

  it("remounts when widgetToken changes", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    const host = hosts()[0];

    await wrapper.setProps({ widgetToken: TOKEN2 });
    await nextTick();
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
    wrapper.unmount();
  });

  it("renders inline into the component's div", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE, mode: "inline" },
      attachTo: document.body,
    });
    await flushAsync();
    expect(
      wrapper.element.querySelector?.("[data-urai-chat-widget]") ??
        document.querySelector("div > [data-urai-chat-widget]"),
    ).not.toBeNull();
    wrapper.unmount();
  });

  it("emits command for stream command events", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    const controller = (
      wrapper.vm as unknown as {
        controller: { open(): void; sendMessage(c: string): void };
      }
    ).controller;
    controller.open();
    controller.sendMessage("hi");
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("command", JSON.stringify({ command: "navigate" }));
    expect(wrapper.emitted("command")).toEqual([[{ command: "navigate" }]]);
    wrapper.unmount();
  });

  it("renders displayComponent commands with displayComponents", async () => {
    const OrderCard = vi.fn((el: HTMLElement, props: Record<string, unknown>) => {
      el.textContent = `Order ${String(props.orderId)}`;
    });
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE, displayComponents: { OrderCard } },
    });
    await flushAsync();
    const controller = (
      wrapper.vm as unknown as {
        controller: { open(): void; sendMessage(c: string): void };
      }
    ).controller;
    controller.open();
    controller.sendMessage("hi");
    await flushAsync();

    FakeEventSource.last()!.dispatch(
      "command",
      JSON.stringify({ command: "displayComponent", component: "OrderCard", props: { orderId: "o-1" } }),
    );
    expect(OrderCard).toHaveBeenCalledTimes(1);
    expect(hosts()[0].querySelector("[data-urai-component]")?.textContent).toBe("Order o-1");
    wrapper.unmount();
  });

  it("emits events and exposes the controller", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    expect(wrapper.emitted("ready")).toHaveLength(1);

    const controller = (
      wrapper.vm as unknown as { controller: { open(): void } }
    ).controller;
    expect(controller).not.toBeNull();
    controller.open();
    await nextTick();
    expect(wrapper.emitted("opened")).toHaveLength(1);
    wrapper.unmount();
  });

  it("emits thread-change for the created thread", async () => {
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    await flushAsync();
    const controller = (
      wrapper.vm as unknown as { controller: { sendMessage(t: string): void } }
    ).controller;
    controller.sendMessage("hi");
    await flushAsync();
    expect(wrapper.emitted("thread-change")?.[0]).toEqual([
      "t1",
      { previousThreadId: null, reason: "created" },
    ]);
    wrapper.unmount();
  });

  it("opens a new threadId in place, without remounting", async () => {
    installFakeFetch(threadRoutes(TOKEN));
    const wrapper = mount(UraiChatWidget, {
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE, readOnly: true, threadId: "tA" },
    });
    await flushAsync();
    const host = hosts()[0];
    await wrapper.setProps({ threadId: "tB" });
    await flushAsync();
    expect(hosts()[0]).toBe(host);
    const controller = (
      wrapper.vm as unknown as { controller: { getThreadId(): string | null } }
    ).controller;
    expect(controller.getThreadId()).toBe("tB");
    wrapper.unmount();
  });
});
