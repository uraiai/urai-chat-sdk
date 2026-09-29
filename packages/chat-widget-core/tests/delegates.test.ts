import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import {
  FakeEventSource,
  flushAsync,
  installFakeEventSource,
  installFakeFetch,
} from "@uraiai/chat-test-support";

/** Sub-agent cards in the imperative widget (closed shadow root). */

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

async function mountWidget() {
  const w = createUraiChatWidget({ widgetToken: TOKEN, userId: "visitor-1", baseUrl: BASE });
  await w.ready;
  w.open();
  return w;
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

function cards() {
  return Array.from(shadow!.querySelectorAll<HTMLElement>(".ucw-delegate"));
}

describe("widget: sub-agent cards", () => {
  it("shows a running card on a delegate call and settles it on completion", async () => {
    installFakeFetch(routes());
    await mountWidget().then((w) => w.sendMessage("research it"));
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("tool_call_started", JSON.stringify({ id: "c0", fn_name: "execute" }));
    es.dispatch(
      "tool_call_started",
      JSON.stringify({ id: "c1", fn_name: "delegate", label: "Compare <b>vendors</b>" }),
    );
    await flushAsync();

    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(card.dataset.status).toBe("running");
    expect(card.querySelector(".ucw-delegate-kind")!.textContent).toBe("Sub-agent");
    expect(card.querySelector(".ucw-delegate-status")!.textContent).toBe("Running");
    // Model output is text, never markup.
    expect(card.querySelector(".ucw-delegate-label")!.textContent).toBe(
      "Compare <b>vendors</b>",
    );
    expect(card.querySelector("b")).toBeNull();
    expect(card.querySelector(".ucw-delegate-steps")).toBeNull();
    // No link to the sub-agent's thread.
    expect(card.querySelector("a")).toBeNull();

    es.dispatch("tool_call_completed", JSON.stringify({ id: "c0", ok: true }));
    es.dispatch(
      "tool_call_completed",
      JSON.stringify({ id: "c1", ok: true, status: "no_output" }),
    );
    es.dispatch("message", "Here is the comparison.");
    await flushAsync();

    const settled = cards()[0];
    expect(settled.dataset.status).toBe("no_output");
    expect(settled.querySelector(".ucw-delegate-status")!.textContent).toBe(
      "No result file",
    );
    // Below the reply text.
    const bubble = settled.closest(".ucw-bubble")!;
    const row = bubble.querySelector(".ucw-delegates")!;
    expect(row.previousElementSibling!.textContent).toContain("Here is the comparison.");
  });

  it("treats ok:false without a status as an error", async () => {
    installFakeFetch(routes());
    await mountWidget().then((w) => w.sendMessage("go"));
    await flushAsync();
    const es = FakeEventSource.last()!;
    es.dispatch(
      "tool_call_started",
      JSON.stringify({ id: "c1", fn_name: "delegate", label: "task" }),
    );
    es.dispatch("tool_call_completed", JSON.stringify({ id: "c1", ok: false }));
    await flushAsync();
    expect(cards()[0].dataset.status).toBe("error");
    expect(cards()[0].querySelector(".ucw-delegate-status")!.textContent).toBe("Error");
  });

  it("renders history cards with step counts, above files", async () => {
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
            content: "All done.",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
            files: [{ path: "/out/data.csv", bytes: 10 }],
            delegates: [
              { id: "c1", label: "First task", status: "completed", steps: 4 },
              { id: "c2", label: "Second task", status: "timeout", steps: 1 },
            ],
          },
          {
            id: "m2",
            thread_id: "t1",
            message_idx: 2,
            role: "assistant",
            content: "",
            reasoning: null,
            created_at: "2026-01-01T00:00:01Z",
            delegates: [{ id: "c3", label: "Only a card", status: "failed", steps: 0 }],
          },
        ],
      }),
    );
    await mountWidget();
    await flushAsync();

    const all = cards();
    expect(all.map((c) => c.dataset.status)).toEqual(["completed", "timeout", "failed"]);
    expect(all[0].querySelector(".ucw-delegate-steps")!.textContent).toBe("4 steps");
    expect(all[1].querySelector(".ucw-delegate-steps")!.textContent).toBe("1 step");
    expect(all[1].querySelector(".ucw-delegate-status")!.textContent).toBe("Timed out");
    expect(all[2].querySelector(".ucw-delegate-steps")).toBeNull();

    const bubble = all[0].closest(".ucw-bubble")!;
    const kids = Array.from(bubble.children).map((c) => c.className);
    expect(kids.indexOf("ucw-delegates")).toBeLessThan(
      kids.findIndex((c) => c.includes("ucw-files")),
    );
  });
});
