import { describe, it, expect, vi } from "vitest";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { createChatStore } from "../../src/headless/store";
import { resolveConfig } from "../../src/config";
import type { WidgetEvent } from "../../src/events";
import {
  clientHello,
  createClientToolRunner,
  parseClientToolCall,
  type ClientToolsOptions,
} from "../../src/headless/client-tools";

const flush = () => new Promise((r) => setTimeout(r, 0));

function openTicketTools(
  handler = vi.fn(async (args: unknown) => ({ opened: (args as { id: string }).id })),
  extra: Partial<ClientToolsOptions> = {},
): ClientToolsOptions {
  return {
    host: "acme",
    tools: [
      {
        name: "open_ticket",
        description: "Open a ticket in the app.",
        parameters: { type: "object", properties: { id: { type: "string" } } },
        handler,
      },
      {
        name: "read_cart",
        description: "Read the cart.",
        effect: "read",
        handler: async () => ({ items: 2 }),
      },
    ],
    ...extra,
  };
}

const call = (id = "c1", tool = "open_ticket", effect: "read" | "write" = "write") => ({
  id,
  tool,
  args: { id: "T-1" },
  effect,
});

function resultsOf(t: FakeTransport) {
  return t.calls.filter((c) => c.method === "postToolCallResult").map((c) => c.args[1]);
}

describe("client tools: hello", () => {
  it("sends declarations, never handlers, with defaults filled in", () => {
    const hello = clientHello(openTicketTools())!;
    expect(hello.host).toBe("acme");
    expect(hello.tools[0]).toEqual({
      name: "open_ticket",
      description: "Open a ticket in the app.",
      parameters: { type: "object", properties: { id: { type: "string" } } },
      effect: "write",
    });
    expect(hello.tools[1].effect).toBe("read");
    expect(JSON.stringify(hello)).not.toContain("handler");
  });

  it("is absent with no tools", () => {
    expect(clientHello(null)).toBeNull();
    expect(clientHello({ tools: [] })).toBeNull();
  });

  it("parses only well-formed calls", () => {
    expect(parseClientToolCall({ id: "c", tool: "t", args: { a: 1 }, effect: "read" })).toEqual({
      id: "c",
      tool: "t",
      args: { a: 1 },
      effect: "read",
    });
    expect(parseClientToolCall({ tool: "t" })).toBeNull();
    expect(parseClientToolCall("nope")).toBeNull();
  });
});

describe("client tools: runner", () => {
  it("claims, runs and posts the result", async () => {
    const t = makeFakeTransport();
    const handler = vi.fn(async (args: unknown, ctx: { threadId: string; callId: string }) => ({
      opened: (args as { id: string }).id,
      thread: ctx.threadId,
    }));
    const runner = createClientToolRunner(openTicketTools(handler as never), t);
    await runner.handle(call(), "t1");
    expect(t.callNames()).toEqual(["claimToolCall", "postToolCallResult"]);
    expect(handler).toHaveBeenCalledOnce();
    expect(resultsOf(t)[0]).toMatchObject({ status: "ok", value: { opened: "T-1", thread: "t1" } });
    // The claim and the result come from the same instance.
    const [claim] = t.calls;
    expect((resultsOf(t)[0] as { instance: string }).instance).toBe(claim.args[1]);
  });

  it("ignores a tool this host did not declare", async () => {
    const t = makeFakeTransport();
    const runner = createClientToolRunner(openTicketTools(), t);
    await runner.handle(call("c1", "someone_elses_tool"), "t1");
    expect(t.calls).toEqual([]);
  });

  it("never runs a call it lost the claim for", async () => {
    const t = makeFakeTransport({ claimWins: () => false });
    const handler = vi.fn();
    const runner = createClientToolRunner(openTicketTools(handler), t);
    await runner.handle(call(), "t1");
    expect(handler).not.toHaveBeenCalled();
    expect(t.callNames()).toEqual(["claimToolCall"]);
  });

  it("runs a replayed call once", async () => {
    const t = makeFakeTransport();
    const handler = vi.fn(async () => "ok");
    const runner = createClientToolRunner(openTicketTools(handler), t);
    await runner.handle(call(), "t1");
    await runner.handle(call(), "t1");
    expect(handler).toHaveBeenCalledOnce();
    expect(t.callNames().filter((n) => n === "claimToolCall")).toHaveLength(1);
  });

  it("a second tab loses the claim and does nothing", async () => {
    const t = makeFakeTransport(); // first claim per id wins
    const a = vi.fn(async () => "a");
    const b = vi.fn(async () => "b");
    await createClientToolRunner(openTicketTools(a), t).handle(call(), "t1");
    await createClientToolRunner(openTicketTools(b), t).handle(call(), "t1");
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it("asks approve for writes and posts a rejection", async () => {
    const t = makeFakeTransport();
    const handler = vi.fn();
    const approve = vi.fn(async () => ({ ok: false as const, note: "not now" }));
    const runner = createClientToolRunner(openTicketTools(handler, { approve }), t);
    await runner.handle(call(), "t1");
    expect(approve).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    expect(resultsOf(t)[0]).toMatchObject({ status: "rejected", error: "not now" });
  });

  it("does not ask approve for reads", async () => {
    const t = makeFakeTransport();
    const approve = vi.fn(async () => ({ ok: false as const }));
    const runner = createClientToolRunner(openTicketTools(undefined, { approve }), t);
    await runner.handle(call("c2", "read_cart", "read"), "t1");
    expect(approve).not.toHaveBeenCalled();
    expect(resultsOf(t)[0]).toMatchObject({ status: "ok", value: { items: 2 } });
  });

  it("reports a handler that throws as an error", async () => {
    const t = makeFakeTransport();
    const runner = createClientToolRunner(
      openTicketTools(vi.fn(async () => {
        throw new Error("no such ticket");
      })),
      t,
    );
    await runner.handle(call(), "t1");
    expect(resultsOf(t)[0]).toMatchObject({ status: "error", error: "no such ticket" });
  });

  it("aborts running handlers", async () => {
    const t = makeFakeTransport();
    let seen: AbortSignal | null = null;
    const runner = createClientToolRunner(
      openTicketTools(vi.fn((_args: unknown, ctx: { signal: AbortSignal }) => {
        seen = ctx.signal;
        return new Promise((_resolve, reject) =>
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      }) as never),
      t,
    );
    const done = runner.handle(call(), "t1");
    await flush();
    runner.abortAll();
    await done;
    expect(seen!.aborted).toBe(true);
    expect(resultsOf(t)[0]).toMatchObject({ status: "error", error: "aborted" });
  });

  it("does nothing on a transport without claim/result", async () => {
    const t = makeFakeTransport({ noClientTools: true });
    const handler = vi.fn();
    await createClientToolRunner(openTicketTools(handler), t).handle(call(), "t1");
    expect(handler).not.toHaveBeenCalled();
  });
});

function makeStore(clientTools: ClientToolsOptions | null, transport = makeFakeTransport()) {
  const events: WidgetEvent[] = [];
  const store = createChatStore({
    transport,
    config: resolveConfig({}),
    userId: "visitor-1",
    emit: (e) => events.push(e),
    batch: "sync",
    clientTools,
  });
  return { store, transport, events };
}

describe("client tools: store", () => {
  it("sends the hello with every message", async () => {
    const { store, transport } = makeStore(openTicketTools());
    await store.actions.send("hi");
    const send = transport.calls.find((c) => c.method === "sendMessage")!;
    expect(send.args[4]).toEqual(clientHello(openTicketTools()));
  });

  it("sends no hello without client tools — the call keeps its old shape", async () => {
    const { store, transport } = makeStore(null);
    await store.actions.send("hi");
    const send = transport.calls.find((c) => c.method === "sendMessage")!;
    expect(send.args).toHaveLength(4);
  });

  it("runs a call that arrives on the turn's stream, with the thread id", async () => {
    const handler = vi.fn(async (_a: unknown, ctx: { threadId: string }) => ctx.threadId);
    const { store, transport } = makeStore(openTicketTools(handler as never));
    await store.actions.send("hi");
    transport.lastStreamHandlers()!.onClientToolCall!(call());
    await flush();
    await flush();
    expect(handler).toHaveBeenCalledOnce();
    expect(resultsOf(transport)[0]).toMatchObject({ status: "ok", value: "t1" });
  });

  it("stop aborts a running call", async () => {
    let signal: AbortSignal | null = null;
    const { store, transport } = makeStore(
      openTicketTools(vi.fn((_a: unknown, ctx: { signal: AbortSignal }) => {
        signal = ctx.signal;
        return new Promise(() => {});
      }) as never),
    );
    await store.actions.send("hi");
    transport.lastStreamHandlers()!.onClientToolCall!(call());
    await flush();
    await flush();
    store.actions.stop();
    expect(signal!.aborted).toBe(true);
  });
});

describe("client tools: compatibility with sendCommand / displayComponent", () => {
  const component = { command: "displayComponent", component: "OrderCard", props: { id: 7 } };
  const navigate = { command: "navigate", url: "/orders" };

  for (const withTools of [false, true]) {
    it(`commands behave exactly as before ${withTools ? "with" : "without"} client tools`, async () => {
      const handler = vi.fn(async () => "ok");
      const { store, transport, events } = makeStore(withTools ? openTicketTools(handler) : null);
      await store.actions.send("hi");
      const h = transport.lastStreamHandlers()!;
      // Interleave every command shape with a client tool call.
      h.onCommandReplay!(component);
      h.onClientToolCall?.(call());
      h.onCommand!(navigate);
      h.onCommand!(component);
      await flush();
      await flush();

      // The host sees live commands only, in order, replay excluded.
      const commands = events.filter((e) => e.type === "command").map((e) => (e as { command: unknown }).command);
      expect(commands).toEqual([navigate, component]);
      // Both displayComponents render (replayed + live); the navigate does not.
      const comps = store.getState().stream!.components.map((c) => c.component);
      expect(comps).toEqual(["OrderCard", "OrderCard"]);
      // The tool ran only when declared.
      expect(handler).toHaveBeenCalledTimes(withTools ? 1 : 0);
      if (!withTools) {
        expect(transport.callNames()).not.toContain("claimToolCall");
      }
    });
  }
});

describe("client tools: inline approval", () => {
  async function pendingCall(tools = openTicketTools(undefined, { approve: "inline" })) {
    const made = makeStore(tools);
    await made.store.actions.send("hi");
    made.transport.lastStreamHandlers()!.onClientToolCall!(call());
    await flush();
    await flush();
    return made;
  }

  it("shows a card in state and runs the call on Allow", async () => {
    const handler = vi.fn(async () => "opened");
    const { store, transport } = await pendingCall(openTicketTools(handler, { approve: "inline" }));
    const [card] = store.getState().approvals;
    expect(card).toMatchObject({
      id: "c1",
      tool: "open_ticket",
      host: "acme",
      description: "Open a ticket in the app.",
      args: { id: "T-1" },
    });
    expect(handler).not.toHaveBeenCalled();

    store.actions.approveToolCall("c1");
    await flush();
    await flush();
    expect(store.getState().approvals).toEqual([]);
    expect(handler).toHaveBeenCalledOnce();
    expect(resultsOf(transport)[0]).toMatchObject({ status: "ok", value: "opened" });
  });

  it("posts a rejection on Decline and never runs the handler", async () => {
    const handler = vi.fn();
    const { store, transport } = await pendingCall(openTicketTools(handler, { approve: "inline" }));
    store.actions.declineToolCall("c1", "wrong ticket");
    await flush();
    expect(store.getState().approvals).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    expect(resultsOf(transport)[0]).toMatchObject({ status: "rejected", error: "wrong ticket" });
  });

  it("never asks about reads", async () => {
    const made = makeStore(openTicketTools(undefined, { approve: "inline" }));
    await made.store.actions.send("hi");
    made.transport.lastStreamHandlers()!.onClientToolCall!(call("c2", "read_cart", "read"));
    await flush();
    await flush();
    expect(made.store.getState().approvals).toEqual([]);
    expect(resultsOf(made.transport)[0]).toMatchObject({ status: "ok" });
  });

  it("declines an open card when the chat stops, so the agent stops waiting", async () => {
    const { store, transport } = await pendingCall();
    store.actions.stop();
    await flush();
    expect(store.getState().approvals).toEqual([]);
    expect(resultsOf(transport)[0]).toMatchObject({ status: "rejected" });
  });

  it("answering twice is harmless", async () => {
    const handler = vi.fn(async () => "x");
    const { store } = await pendingCall(openTicketTools(handler, { approve: "inline" }));
    store.actions.approveToolCall("c1");
    store.actions.declineToolCall("c1");
    await flush();
    await flush();
    expect(handler).toHaveBeenCalledOnce();
  });
});
