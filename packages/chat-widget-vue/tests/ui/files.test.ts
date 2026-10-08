/**
 * Workspace files in the Vue view: what the assistant wrote to the thread's
 * filesystem, shown on the turn that produced it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enableAutoUnmount } from "@vue/test-utils";
import { makeFakeTransport } from "@uraiai/chat-test-support";
import { frame, mountChat, part, startTurn, waitFor } from "./helpers";

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
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const LISTING = [
  { path: "/out/chart.svg", bytes: 120 },
  { path: "/out/photo.png", bytes: 300 },
  { path: "/out/data.csv", bytes: 2048 },
];

async function turn() {
  const transport = makeFakeTransport();
  const { wrapper } = mountChat({ transport, props: { fetchServerConfig: true } });
  const h = await startTurn(wrapper, transport, "chart it");
  return { transport, wrapper, h };
}

describe("Vue view — workspace files", () => {
  it("renders a live turn's files: pictures inline, the rest as downloads", async () => {
    const { transport, h } = await turn();
    h.onToolCallStarted?.({ id: "c1", fn_name: "execute" });
    h.onToolCallCompleted?.({ id: "c1", ok: true, files: LISTING });
    await frame();

    const list = part("file-list")!;
    expect(list).toBeTruthy();
    await waitFor(() =>
      expect(list.querySelector<HTMLImageElement>('img[alt="chart.svg"]')?.src).toMatch(/^blob:/),
    );
    const csv = list.querySelector<HTMLAnchorElement>('[data-urai-part="file-download"]')!;
    expect(csv.textContent).toContain("data.csv");
    expect(csv.textContent).toContain("2.0 KB");
    expect(csv.getAttribute("download")).toBe("data.csv");

    // Fetched through the transport (visitor header), never a server URL.
    expect(
      transport.calls.filter((c) => c.method === "fetchThreadFile").map((c) => c.args),
    ).toEqual(expect.arrayContaining([["t1", "/out/chart.svg"], ["t1", "/out/data.csv"]]));
  });

  it("refetches a file rewritten at the same size", async () => {
    const { transport, h } = await turn();
    const chart = { path: "/out/chart.png", bytes: 100, modified_at: "2026-01-01T00:00:01Z" };
    h.onToolCallCompleted?.({ id: "c1", ok: true, files: [chart] });
    await frame();
    const fetches = () =>
      transport.calls.filter((c) => c.method === "fetchThreadFile" && c.args[1] === chart.path)
        .length;
    await waitFor(() => expect(fetches()).toBe(1));

    h.onToolCallCompleted?.({
      id: "c2",
      ok: true,
      files: [{ ...chart, modified_at: "2026-01-01T00:00:09Z" }],
    });
    await frame();
    await waitFor(() => expect(fetches()).toBe(2));
  });

  it("never opens an SVG in a tab — it downloads; a raster opens", async () => {
    const { h } = await turn();
    h.onToolCallCompleted?.({ id: "c1", ok: true, files: LISTING });
    await frame();
    await waitFor(() =>
      expect(document.querySelector('img[alt="chart.svg"]')?.getAttribute("src")).toBeTruthy(),
    );

    const svgLink = document.querySelector('img[alt="chart.svg"]')!.closest("a")!;
    expect(svgLink.getAttribute("target")).toBeNull();
    expect(svgLink.getAttribute("download")).toBe("chart.svg");
    // The download copy is a different, retyped object URL.
    await waitFor(() => expect(svgLink.getAttribute("href")).toMatch(/^blob:/));
    expect(svgLink.getAttribute("href")).not.toBe(
      document.querySelector('img[alt="chart.svg"]')!.getAttribute("src"),
    );

    const pngLink = document.querySelector('img[alt="photo.png"]')!.closest("a")!;
    expect(pngLink.getAttribute("target")).toBe("_blank");
    expect(pngLink.hasAttribute("download")).toBe(false);
  });

  it("keeps the files on the message once the turn is committed", async () => {
    const { h } = await turn();
    h.onToolCallCompleted?.({ id: "c1", ok: true, files: [LISTING[2]] });
    h.onChunk?.("Here is the data.");
    h.onDone?.();
    await frame();
    const messages = document.querySelectorAll('[data-urai-part="assistant-message"]');
    const last = messages[messages.length - 1];
    expect(last.getAttribute("data-state")).not.toBe("streaming");
    expect(last.querySelector('[data-urai-part="file-download"]')?.textContent).toContain(
      "data.csv",
    );
  });

  it("renders no file list for a turn without files", async () => {
    const { h } = await turn();
    h.onChunk?.("hello");
    h.onDone?.();
    await frame();
    expect(part("file-list")).toBeNull();
  });

  it("offers the zip in the header once a file is shown, and saves it", async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const { transport, h } = await turn();
    expect(part("archive-button")).toBeNull();

    h.onToolCallCompleted?.({ id: "c1", ok: true, files: [LISTING[0]] });
    await frame();
    const button = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Download all files"]',
      );
      if (!el) throw new Error("no archive button");
      return el;
    });

    button.click();
    await waitFor(() => expect(clicked).toContain("t1.zip"));
    expect(transport.calls.find((c) => c.method === "fetchThreadArchive")?.args).toEqual(["t1"]);
    await frame();
    expect(part("archive-button")!.hasAttribute("disabled")).toBe(false);
  });
});

describe("Vue view — attachments", () => {
  it("uploads a picked file, shows a chip, and sends it with the message", async () => {
    const transport = makeFakeTransport();
    const { wrapper } = mountChat({ transport });
    await waitFor(() => expect(part("attach-button")).toBeTruthy());

    const input = wrapper.find('input[type="file"]');
    const file = new File(["hi"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    await waitFor(() => expect(transport.callNames()).toContain("uploadAttachment"));
    await frame();
    const chip = part("pending-attachment")!;
    expect(chip.textContent).toContain("notes.txt");
    expect(chip.querySelector('button[aria-label="Remove notes.txt"]')).toBeTruthy();
  });
});
