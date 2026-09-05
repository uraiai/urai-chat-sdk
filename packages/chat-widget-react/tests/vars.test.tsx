import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createRef as makeRef } from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat, type UraiChatHandle } from "../src/ui";

/**
 * `vars` is the per-thread context an embedder attaches to a
 * conversation — the plan, the page, the account. It reaches the server
 * two ways: in the body of the thread-create call, and as a PATCH to an
 * existing thread. Both paths matter, and so does updating them after
 * mount, since a single-page app changes context on navigation without
 * ever remounting the widget.
 */

beforeEach(() => {
  // The store persists the visitor's thread id, so without this a later
  // test auto-restores the previous one instead of creating a thread.
  localStorage.clear();
});

afterEach(cleanup);

const TOKEN = "11111111-2222-3333-4444-555555555555";

function mount(props: Record<string, unknown> = {}, transport?: FakeTransport) {
  const t = transport ?? makeFakeTransport();
  const utils = render(
    <UraiChat
      widgetToken={TOKEN}
      userId="visitor-1"
      fetchServerConfig={false}
      transport={t}
      disableStyleInjection
      {...props}
    />,
  );
  return { transport: t, ...utils };
}

const ready = () => screen.findByRole("textbox");

function callArgs(t: FakeTransport, method: string) {
  return t.calls.filter((c) => c.method === method).map((c) => c.args);
}

describe("vars: reaching the server", () => {
  it("sends the initial vars in the thread-create body", async () => {
    const { transport } = mount({ vars: { plan: "pro", page: "/pricing" } });
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("createOrResumeThread"),
    );
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { plan: "pro", page: "/pricing" },
    });
  });

  it("omits vars entirely when none are set", async () => {
    const { transport } = mount();
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("createOrResumeThread"),
    );
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
    });
  });
});

describe("vars: live prop updates", () => {
  // A single-page app changes context on navigation. The widget is not
  // remounted, so the prop change has to reach the store.
  it("patches the server when the vars prop changes mid-conversation", async () => {
    const transport = makeFakeTransport();
    const { rerender } = mount({ vars: { page: "/pricing" } }, transport);
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    rerender(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
        vars={{ page: "/checkout" }}
      />,
    );

    await waitFor(() =>
      expect(transport.callNames()).toContain("updateThreadVars"),
    );
    expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual([
      "t1",
      { page: "/checkout" },
    ]);
  });

  // Object literals are recreated on every parent render; comparing by
  // value is what stops that turning into a PATCH per render.
  it("does not patch when an equal vars object is passed again", async () => {
    const transport = makeFakeTransport();
    const { rerender } = mount({ vars: { page: "/pricing" } }, transport);
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    for (let i = 0; i < 3; i++) {
      rerender(
        <UraiChat
          widgetToken={TOKEN}
          userId="visitor-1"
          fetchServerConfig={false}
          transport={transport}
          disableStyleInjection
          vars={{ page: "/pricing" }}
        />,
      );
    }
    expect(callArgs(transport, "updateThreadVars")).toHaveLength(0);
  });

  it("carries updated vars into the next thread that gets created", async () => {
    const transport = makeFakeTransport();
    const { rerender } = mount({ vars: { page: "/a" } }, transport);
    await ready();
    rerender(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
        vars={{ page: "/b" }}
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("createOrResumeThread"),
    );
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { page: "/b" },
    });
  });

  it("clears vars when the prop goes to null", async () => {
    const transport = makeFakeTransport();
    const { rerender } = mount({ vars: { page: "/a" } }, transport);
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    rerender(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
        vars={null}
      />,
    );
    await waitFor(() =>
      expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual(["t1", null]),
    );
  });
});

describe("vars: the imperative handle", () => {
  it("exposes setVars, setUser and startConversation to host code", async () => {
    const ref = makeRef<UraiChatHandle>();
    const transport = makeFakeTransport();
    render(
      <UraiChat
        ref={ref}
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
      />,
    );
    await ready();
    expect(typeof ref.current?.setVars).toBe("function");
    expect(typeof ref.current?.setUser).toBe("function");
    expect(typeof ref.current?.startConversation).toBe("function");

    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    ref.current!.setVars({ tier: "enterprise" });
    await waitFor(() =>
      expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual([
        "t1",
        { tier: "enterprise" },
      ]),
    );
  });

  it("buffers vars through startConversation without hitting the server", async () => {
    const ref = makeRef<UraiChatHandle>();
    const transport = makeFakeTransport();
    render(
      <UraiChat
        ref={ref}
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
      />,
    );
    await ready();

    // Thread creation is lazy, so "every navigation calls
    // startConversation" stays cheap — no request until a message.
    ref.current!.startConversation({ page: "/support" });
    expect(transport.calls).toEqual([]);

    await userEvent.type(screen.getByRole("textbox"), "help{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("createOrResumeThread"),
    );
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { page: "/support" },
    });
  });

  it("sets vars alongside a new visitor identity", async () => {
    const ref = makeRef<UraiChatHandle>();
    const transport = makeFakeTransport();
    render(
      <UraiChat
        ref={ref}
        widgetToken={TOKEN}
        userId="visitor-1"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
      />,
    );
    await ready();
    ref.current!.setUser({ id: "visitor-2", vars: { plan: "team" } });
    await userEvent.type(screen.getByRole("textbox"), "hi{Enter}");
    await waitFor(() =>
      expect(transport.callNames()).toContain("createOrResumeThread"),
    );
    expect(transport.callNames()).toContain("setWidgetUserId");
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { plan: "team" },
    });
  });
});

describe("identity: applied live, not by remounting", () => {
  // Remounting would tear down the widget and re-fetch config; the store
  // already knows how to re-scope the transport and clear the transcript.
  it("switches visitor without recreating the widget", async () => {
    const transport = makeFakeTransport();
    const { rerender } = mount({}, transport);
    await ready();
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    expect(screen.getByText("hello")).toBeTruthy();

    rerender(
      <UraiChat
        widgetToken={TOKEN}
        userId="visitor-2"
        fetchServerConfig={false}
        transport={transport}
        disableStyleInjection
      />,
    );

    await waitFor(() =>
      expect(transport.callNames()).toContain("setWidgetUserId"),
    );
    // The previous visitor's conversation is gone, and there is still
    // exactly one widget on the page.
    expect(screen.queryByText("hello")).toBeNull();
    expect(document.querySelectorAll('[data-urai-part="root"]')).toHaveLength(1);
  });
});
