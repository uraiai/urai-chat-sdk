import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUraiChatWidget } from "../src/create-widget";
import {
  FakeEventSource,
  flushAsync,
  installFakeEventSource,
  installFakeFetch,
  respond,
} from "@uraiai/chat-test-support";

/**
 * Workspace files in the imperative widget: the one view whose DOM sits
 * in a *closed* shadow root, so the root is captured as it is attached.
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
    [`GET ${API}/threads/t1/files/out/chart.svg`]: () =>
      respond({ blob: new Blob(["<svg/>"], { type: "image/svg+xml" }) }),
    [`GET ${API}/threads/t1/files/out/data.csv`]: () =>
      respond({ blob: new Blob(["a,b"], { type: "text/csv" }) }),
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
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:test/${++n}`),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  document.querySelectorAll("[data-urai-chat-widget]").forEach((el) => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("widget: workspace files", () => {
  it("renders a streamed turn's files: images inline, the rest as downloads", async () => {
    const { calls } = installFakeFetch(routes());
    await mountWidget().then((w) => w.sendMessage("chart it"));
    await flushAsync();

    const es = FakeEventSource.last()!;
    es.dispatch("tool_call_started", JSON.stringify({ id: "c1", fn_name: "execute" }));
    es.dispatch(
      "tool_call_completed",
      JSON.stringify({
        id: "c1",
        ok: true,
        files: [
          { path: "/out/chart.svg", bytes: 120 },
          { path: "/out/data.csv", bytes: 2048 },
        ],
      }),
    );
    await flushAsync();

    const img = shadow!.querySelector<HTMLImageElement>(".ucw-files img")!;
    expect(img.alt).toBe("chart.svg");
    expect(img.src).toMatch(/^blob:test\//);
    const chip = shadow!.querySelector(".ucw-files .ucw-attachment-file")!;
    expect(chip.textContent).toContain("data.csv");
    expect(chip.textContent).toContain("2.0 KB");

    // The image was fetched with the visitor header, not via <img src>.
    const fileCall = calls.find((c) => c.pathname.endsWith("/files/out/chart.svg"))!;
    expect((fileCall.init?.headers as Record<string, string>)["x-widget-user-id"]).toBe(
      "visitor-1",
    );

    // A later listing that changes nothing does not refetch the image.
    const fetchesBefore = calls.length;
    es.dispatch(
      "tool_call_completed",
      JSON.stringify({
        id: "c2",
        ok: true,
        files: [
          { path: "/out/chart.svg", bytes: 120 },
          { path: "/out/data.csv", bytes: 2048 },
        ],
      }),
    );
    await flushAsync();
    expect(calls.length).toBe(fetchesBefore);
    expect(shadow!.querySelectorAll(".ucw-files > *")).toHaveLength(2);
  });

  it("shows history files, then shows only what the next turn changed", async () => {
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
            content: "Here it is.",
            reasoning: null,
            created_at: "2026-01-01T00:00:00Z",
            files: [
              { path: "/out/chart.svg", bytes: 120 },
              { path: "/out/data.csv", bytes: 2048 },
            ],
          },
        ],
      }),
    );
    const w = await mountWidget();
    await flushAsync();
    expect(shadow!.querySelectorAll(".ucw-files > *")).toHaveLength(2);

    w.sendMessage("make the bars blue");
    await flushAsync();
    const es = FakeEventSource.last()!;
    es.dispatch("tool_call_started", JSON.stringify({ id: "c1", fn_name: "execute" }));
    es.dispatch(
      "tool_call_completed",
      JSON.stringify({
        id: "c1",
        ok: true,
        files: [
          { path: "/out/chart.svg", bytes: 131 },
          { path: "/out/data.csv", bytes: 2048 },
        ],
      }),
    );
    await flushAsync();
    const rows = shadow!.querySelectorAll(".ucw-files");
    expect(rows).toHaveLength(2);
    // The new bubble carries the rewritten chart and not the unchanged CSV.
    expect(rows[1].children).toHaveLength(1);
    expect(rows[1].querySelector("img")?.alt).toBe("chart.svg");
  });
});
