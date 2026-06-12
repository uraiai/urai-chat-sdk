import { act, render } from "@testing-library/react";
import { StrictMode, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetController } from "@uraiai/chat-widget-core";
import { UraiChatWidget } from "../src/index";
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

describe("UraiChatWidget (React)", () => {
  it("mounts exactly one widget under StrictMode and unmounts cleanly", async () => {
    const { unmount } = render(
      <StrictMode>
        <UraiChatWidget widgetToken={TOKEN} userId="v1" baseUrl={BASE} />
      </StrictMode>,
    );
    await act(flushAsync);
    expect(hosts()).toHaveLength(1);
    unmount();
    expect(hosts()).toHaveLength(0);
  });

  it("applies theme changes live without remounting", async () => {
    const { rerender } = render(
      <UraiChatWidget widgetToken={TOKEN} userId="v1" baseUrl={BASE} />,
    );
    await act(flushAsync);
    const host = hosts()[0];

    rerender(
      <UraiChatWidget
        widgetToken={TOKEN}
        userId="v1"
        baseUrl={BASE}
        theme={{ primaryColor: "#ff0000" }}
      />,
    );
    await act(flushAsync);
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).toBe(host); // same element — no remount
  });

  it("remounts when widgetToken changes", async () => {
    const { rerender } = render(
      <UraiChatWidget widgetToken={TOKEN} userId="v1" baseUrl={BASE} />,
    );
    await act(flushAsync);
    const host = hosts()[0];

    rerender(
      <UraiChatWidget widgetToken={TOKEN2} userId="v1" baseUrl={BASE} />,
    );
    await act(flushAsync);
    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(host);
  });

  it("renders an inline container div in inline mode", async () => {
    const { container } = render(
      <UraiChatWidget
        widgetToken={TOKEN}
        userId="v1"
        baseUrl={BASE}
        mode="inline"
        className="my-chat"
      />,
    );
    await act(flushAsync);
    const inlineDiv = container.querySelector(".my-chat");
    expect(inlineDiv).not.toBeNull();
    expect(inlineDiv!.querySelector("[data-urai-chat-widget]")).not.toBeNull();
  });

  it("exposes a working controller through the ref", async () => {
    const ref = createRef<WidgetController>();
    const onOpened = vi.fn();
    render(
      <UraiChatWidget
        ref={ref}
        widgetToken={TOKEN}
        userId="v1"
        baseUrl={BASE}
        onOpened={onOpened}
      />,
    );
    await act(flushAsync);
    act(() => ref.current!.open());
    expect(onOpened).toHaveBeenCalledOnce();
  });

  it("fires onCommand for stream command events", async () => {
    const ref = createRef<WidgetController>();
    const onCommand = vi.fn();
    render(
      <UraiChatWidget
        ref={ref}
        widgetToken={TOKEN}
        userId="v1"
        baseUrl={BASE}
        onCommand={onCommand}
      />,
    );
    await act(flushAsync);
    act(() => {
      ref.current!.open();
      ref.current!.sendMessage("hi");
    });
    await act(flushAsync);

    const es = FakeEventSource.last()!;
    act(() => es.dispatch("command", JSON.stringify({ command: "navigate" })));
    expect(onCommand).toHaveBeenCalledWith({ command: "navigate" });
  });

  it("fires onReady and onError callbacks", async () => {
    const onReady = vi.fn();
    render(
      <UraiChatWidget
        widgetToken={TOKEN}
        userId="v1"
        baseUrl={BASE}
        onReady={onReady}
      />,
    );
    await act(flushAsync);
    expect(onReady).toHaveBeenCalledOnce();
  });
});
