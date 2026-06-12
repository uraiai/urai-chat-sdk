import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UraiChatWidget from "../src/lib/UraiChatWidget.svelte";
import {
  FakeEventSource,
  installFakeEventSource,
  installFakeFetch,
  flushAsync,
} from "../../chat-widget-core/tests/helpers";

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

describe("UraiChatWidget (Svelte)", () => {
  it("mounts one widget and destroys it on unmount", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const instance = mount(UraiChatWidget, {
      target,
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE },
    });
    flushSync();
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    unmount(instance);
    flushSync();
    expect(hosts()).toHaveLength(0);
    target.remove();
  });

  it("applies theme changes live without remounting", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const props = $state({
      widgetToken: TOKEN,
      userId: "v1",
      baseUrl: BASE,
      theme: undefined as { primaryColor: string } | undefined,
    });
    const instance = mount(UraiChatWidget, { target, props });
    flushSync();
    await flushAsync();
    const host = hosts()[0];

    props.theme = { primaryColor: "#ff0000" };
    flushSync();
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).toBe(host); // same element — no remount
    unmount(instance);
    target.remove();
  });

  it("remounts when widgetToken changes", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const props = $state({ widgetToken: TOKEN, userId: "v1", baseUrl: BASE });
    const instance = mount(UraiChatWidget, { target, props });
    flushSync();
    await flushAsync();
    const host = hosts()[0];

    props.widgetToken = TOKEN2;
    flushSync();
    await flushAsync();
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
    unmount(instance);
    target.remove();
  });

  it("renders inline into the component's div and exposes the controller", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const onopened = vi.fn();
    const instance = mount(UraiChatWidget, {
      target,
      props: {
        widgetToken: TOKEN,
        userId: "v1",
        baseUrl: BASE,
        mode: "inline",
        onopened,
      },
    });
    flushSync();
    await flushAsync();
    expect(target.querySelector("[data-urai-chat-widget]")).not.toBeNull();

    const controller = (
      instance as unknown as { getController(): { open(): void } | null }
    ).getController();
    expect(controller).not.toBeNull();
    unmount(instance);
    target.remove();
  });

  it("fires oncommand for stream command events", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const oncommand = vi.fn();
    const instance = mount(UraiChatWidget, {
      target,
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE, oncommand },
    });
    flushSync();
    await flushAsync();

    const controller = (
      instance as unknown as {
        getController(): { open(): void; sendMessage(c: string): void } | null;
      }
    ).getController()!;
    controller.open();
    controller.sendMessage("hi");
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("command", JSON.stringify({ command: "navigate" }));
    expect(oncommand).toHaveBeenCalledWith({ command: "navigate" });
    unmount(instance);
    target.remove();
  });

  it("fires onready callback", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const onready = vi.fn();
    const instance = mount(UraiChatWidget, {
      target,
      props: { widgetToken: TOKEN, userId: "v1", baseUrl: BASE, onready },
    });
    flushSync();
    await flushAsync();
    expect(onready).toHaveBeenCalledOnce();
    unmount(instance);
    target.remove();
  });
});
