import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat, type UraiChatHandle } from "../../src/ui";
import { TOKEN, callArgs, frame, mountChat, part, ready, send, waitFor } from "./helpers";

/**
 * `vars` is the per-thread context an embedder attaches to a conversation —
 * the plan, the page, the account. It reaches the server two ways: in the
 * body of the thread-create call, and as a PATCH to an existing thread. Both
 * paths matter, and so does updating them after mount, since a single-page
 * app changes context on navigation without ever remounting the chat.
 */

beforeEach(() => localStorage.clear());
enableAutoUnmount(afterEach);

/** Mount through a parent holding a template ref, as a host app would. */
function mountWithHandle(transport: FakeTransport = makeFakeTransport()) {
  const chat = ref<UraiChatHandle | null>(null);
  const Host = defineComponent({
    setup: () => () =>
      h(UraiChat, {
        ref: chat,
        widgetToken: TOKEN,
        userId: "visitor-1",
        fetchServerConfig: false,
        transport,
        disableStyleInjection: true,
      }),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { chat, transport, wrapper };
}

describe("vars (Vue): reaching the server", () => {
  it("sends the initial vars in the thread-create body", async () => {
    const { wrapper, transport } = mountChat({ props: { vars: { plan: "pro", page: "/pricing" } } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("createOrResumeThread"));
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { plan: "pro", page: "/pricing" },
    });
  });

  it("omits vars entirely when none are set", async () => {
    const { wrapper, transport } = mountChat();
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("createOrResumeThread"));
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({ force_new: true });
  });
});

describe("vars (Vue): live prop updates", () => {
  // A single-page app changes context on navigation. The chat is not
  // remounted, so the prop change has to reach the store.
  it("patches the server when the vars prop changes mid-conversation", async () => {
    const { wrapper, transport } = mountChat({ props: { vars: { page: "/pricing" } } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    await wrapper.setProps({ vars: { page: "/checkout" } });
    await waitFor(() => expect(transport.callNames()).toContain("updateThreadVars"));
    expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual(["t1", { page: "/checkout" }]);
  });

  // Object literals are recreated on every parent render; comparing by value
  // is what stops that turning into a PATCH per render.
  it("does not patch when an equal vars object is passed again", async () => {
    const { wrapper, transport } = mountChat({ props: { vars: { page: "/pricing" } } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    for (let i = 0; i < 3; i++) await wrapper.setProps({ vars: { page: "/pricing" } });
    await frame();
    expect(callArgs(transport, "updateThreadVars")).toHaveLength(0);
  });

  it("carries updated vars into the next thread that gets created", async () => {
    const { wrapper, transport } = mountChat({ props: { vars: { page: "/a" } } });
    await ready(wrapper);
    await wrapper.setProps({ vars: { page: "/b" } });
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("createOrResumeThread"));
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { page: "/b" },
    });
  });

  it("clears vars when the prop goes to null", async () => {
    const { wrapper, transport } = mountChat({ props: { vars: { page: "/a" } } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    await wrapper.setProps({ vars: null });
    await waitFor(() =>
      expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual(["t1", null]),
    );
  });

  it("patches collections when the prop changes, by value", async () => {
    const { wrapper, transport } = mountChat({ props: { collections: ["c1"] } });
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    await wrapper.setProps({ collections: ["c1"] });
    await frame();
    expect(callArgs(transport, "updateThreadCollections")).toHaveLength(0);
    await wrapper.setProps({ collections: ["c2"] });
    await waitFor(() =>
      expect(callArgs(transport, "updateThreadCollections").at(-1)).toEqual(["t1", ["c2"]]),
    );
  });
});

describe("vars (Vue): the imperative handle", () => {
  it("exposes setVars, setUser and startConversation to host code", async () => {
    const { chat, transport, wrapper } = mountWithHandle();
    await ready(wrapper);
    expect(typeof chat.value?.setVars).toBe("function");
    expect(typeof chat.value?.setUser).toBe("function");
    expect(typeof chat.value?.startConversation).toBe("function");

    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));

    chat.value!.setVars({ tier: "enterprise" });
    await waitFor(() =>
      expect(callArgs(transport, "updateThreadVars").at(-1)).toEqual([
        "t1",
        { tier: "enterprise" },
      ]),
    );
  });

  it("buffers vars through startConversation without hitting the server", async () => {
    const { chat, transport, wrapper } = mountWithHandle();
    await ready(wrapper);

    // Thread creation is lazy, so "every navigation calls startConversation"
    // stays cheap — no request until a message.
    chat.value!.startConversation({ page: "/support" });
    expect(transport.calls).toEqual([]);

    await send(wrapper, "help");
    await waitFor(() => expect(transport.callNames()).toContain("createOrResumeThread"));
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { page: "/support" },
    });
  });

  it("sets vars alongside a new visitor identity", async () => {
    const { chat, transport, wrapper } = mountWithHandle();
    await ready(wrapper);
    chat.value!.setUser({ id: "visitor-2", vars: { plan: "team" } });
    await send(wrapper, "hi");
    await waitFor(() => expect(transport.callNames()).toContain("createOrResumeThread"));
    expect(transport.callNames()).toContain("setWidgetUserId");
    expect(callArgs(transport, "createOrResumeThread")[0][0]).toEqual({
      force_new: true,
      vars: { plan: "team" },
    });
  });

  it("sends a message and reports state through the handle", async () => {
    const { chat, transport, wrapper } = mountWithHandle();
    await ready(wrapper);
    await chat.value!.ready;
    chat.value!.sendMessage("Where is my order?");
    await waitFor(() =>
      expect(callArgs(transport, "sendMessage").map((a) => a[1])).toEqual(["Where is my order?"]),
    );
    expect(chat.value!.getThreadId()).toBe("t1");
    expect(chat.value!.getState()?.messages.length).toBeGreaterThan(0);
  });
});

describe("identity (Vue): applied live, not by remounting", () => {
  // Remounting would tear down the chat and re-fetch config; the store
  // already knows how to re-scope the transport and clear the transcript.
  it("switches visitor without recreating the chat", async () => {
    const { wrapper, transport } = mountChat();
    await ready(wrapper);
    await send(wrapper, "hello");
    await waitFor(() => expect(transport.callNames()).toContain("sendMessage"));
    await frame();
    expect(part("user-message")?.textContent).toContain("hello");

    await wrapper.setProps({ userId: "visitor-2" });
    await waitFor(() => expect(transport.callNames()).toContain("setWidgetUserId"));
    await frame();
    expect(part("user-message")).toBeNull();
    expect(document.querySelectorAll('[data-urai-part="root"]')).toHaveLength(1);
  });
});
