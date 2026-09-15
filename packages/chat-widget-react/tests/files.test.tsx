/**
 * Workspace files in the React view: what the assistant wrote to the
 * thread's filesystem, shown on the turn that produced it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat } from "../src/ui";

const TOKEN = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  localStorage.clear();
  let n = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:test/${++n}`),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function frame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

async function startTurn(transport: FakeTransport) {
  const utils = render(
    <UraiChat widgetToken={TOKEN} userId="visitor-1" transport={transport} open />,
  );
  await screen.findByRole("textbox");
  await userEvent.type(screen.getByRole("textbox"), "chart it{Enter}");
  await waitFor(() => expect(transport.lastStreamHandlers()).toBeTruthy());
  return { ...utils, h: transport.lastStreamHandlers()! };
}

const LISTING = [
  { path: "/out/chart.svg", bytes: 120 },
  { path: "/out/photo.png", bytes: 300 },
  { path: "/out/data.csv", bytes: 2048 },
];

describe("React view — workspace files", () => {
  it("renders a live turn's files: pictures inline, the rest as downloads", async () => {
    const transport = makeFakeTransport();
    const { container, h } = await startTurn(transport);
    await act(async () => {
      h.onToolCallStarted?.({ id: "c1", fn_name: "execute" });
      h.onToolCallCompleted?.({ id: "c1", ok: true, files: LISTING });
    });
    await frame();

    const list = container.querySelector('[data-urai-part="file-list"]')!;
    expect(list).toBeTruthy();
    await waitFor(() =>
      expect(list.querySelector<HTMLImageElement>('img[alt="chart.svg"]')?.src).toMatch(/^blob:/),
    );
    const csv = list.querySelector<HTMLAnchorElement>('[data-urai-part="file-download"]')!;
    expect(csv.textContent).toContain("data.csv");
    expect(csv.textContent).toContain("2.0 KB");
    expect(csv.getAttribute("download")).toBe("data.csv");

    // Fetched through the transport (visitor header), never a server URL.
    expect(transport.calls.filter((c) => c.method === "fetchThreadFile").map((c) => c.args)).toEqual(
      expect.arrayContaining([["t1", "/out/chart.svg"], ["t1", "/out/data.csv"]]),
    );
  });

  it("refetches a file rewritten at the same size", async () => {
    const transport = makeFakeTransport();
    const { h } = await startTurn(transport);
    const chart = { path: "/out/chart.png", bytes: 100, modified_at: "2026-01-01T00:00:01Z" };
    await act(async () => {
      h.onToolCallCompleted?.({ id: "c1", ok: true, files: [chart] });
    });
    await frame();
    const fetches = () =>
      transport.calls.filter((c) => c.method === "fetchThreadFile" && c.args[1] === chart.path).length;
    await waitFor(() => expect(fetches()).toBe(1));

    await act(async () => {
      h.onToolCallCompleted?.({
        id: "c2",
        ok: true,
        files: [{ ...chart, modified_at: "2026-01-01T00:00:09Z" }],
      });
    });
    await frame();
    await waitFor(() => expect(fetches()).toBe(2));
  });

  it("never opens an SVG in a tab — it downloads; a raster opens", async () => {
    const transport = makeFakeTransport();
    const { container, h } = await startTurn(transport);
    await act(async () => {
      h.onToolCallCompleted?.({ id: "c1", ok: true, files: LISTING });
    });
    await frame();
    await waitFor(() =>
      expect(container.querySelector('img[alt="chart.svg"]')?.getAttribute("src")).toBeTruthy(),
    );

    const svgLink = container.querySelector('img[alt="chart.svg"]')!.closest("a")!;
    expect(svgLink.getAttribute("target")).toBeNull();
    expect(svgLink.getAttribute("download")).toBe("chart.svg");
    // The download copy is a different, retyped object URL.
    await waitFor(() => expect(svgLink.getAttribute("href")).toMatch(/^blob:/));
    expect(svgLink.getAttribute("href")).not.toBe(
      container.querySelector('img[alt="chart.svg"]')!.getAttribute("src"),
    );

    const pngLink = container.querySelector('img[alt="photo.png"]')!.closest("a")!;
    expect(pngLink.getAttribute("target")).toBe("_blank");
    expect(pngLink.hasAttribute("download")).toBe(false);
  });

  it("keeps the files on the message once the turn is committed", async () => {
    const transport = makeFakeTransport();
    const { container, h } = await startTurn(transport);
    await act(async () => {
      h.onToolCallCompleted?.({ id: "c1", ok: true, files: [LISTING[2]] });
      h.onChunk?.("Here is the data.");
      h.onDone?.();
    });
    await frame();
    const messages = container.querySelectorAll('[data-urai-part="assistant-message"]');
    const last = messages[messages.length - 1];
    expect(last.getAttribute("data-state")).not.toBe("streaming");
    expect(last.querySelector('[data-urai-part="file-download"]')?.textContent).toContain(
      "data.csv",
    );
  });

  it("renders no file list for a turn without files", async () => {
    const transport = makeFakeTransport();
    const { container, h } = await startTurn(transport);
    await act(async () => {
      h.onChunk?.("hello");
      h.onDone?.();
    });
    await frame();
    expect(container.querySelector('[data-urai-part="file-list"]')).toBeNull();
  });

  it("offers the zip in the header once a file is shown, and saves it", async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const transport = makeFakeTransport();
    const { h } = await startTurn(transport);
    expect(screen.queryByRole("button", { name: "Download all files" })).toBeNull();

    await act(async () => {
      h.onToolCallCompleted?.({ id: "c1", ok: true, files: [LISTING[0]] });
    });
    await frame();
    const button = await screen.findByRole("button", { name: "Download all files" });

    await userEvent.click(button);
    await waitFor(() => expect(clicked).toContain("t1.zip"));
    expect(transport.calls.find((c) => c.method === "fetchThreadArchive")?.args).toEqual(["t1"]);
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});
