import { describe, expect, it } from "vitest";
import {
  freshFiles,
  isImageFile,
  isScriptableFile,
  shownFileVersions,
  threadHasFiles,
  withoutFiles,
  workspaceFileName,
} from "../../src/headless/files";
import type { ChatMessage } from "../../src/headless/types";

function assistant(
  id: string,
  files: { path: string; bytes: number; modified_at?: string }[],
): ChatMessage {
  return { id, role: "assistant", content: "", reasoning: null, attachments: [], files };
}

describe("workspace files", () => {
  it("names a file by its last segment", () => {
    expect(workspaceFileName("/out/q3/report.xlsx")).toBe("report.xlsx");
  });

  it("renders pictures inline, SVG included, and nothing else", () => {
    expect(isImageFile("/out/chart.SVG")).toBe(true);
    expect(isImageFile("/out/photo.jpeg")).toBe(true);
    expect(isImageFile("/out/data.csv")).toBe(false);
    expect(isImageFile("/out/svg.txt")).toBe(false);
  });

  it("treats SVG and HTML as scriptable, rasters as not", () => {
    expect(isScriptableFile("/out/chart.svg")).toBe(true);
    expect(isScriptableFile("/out/report.html")).toBe(true);
    expect(isScriptableFile("/out/chart.png")).toBe(false);
  });

  it("shows a listing's new and rewritten files only, even at the same size", () => {
    const shown = shownFileVersions([
      assistant("m1", [{ path: "/out/chart.svg", bytes: 100, modified_at: "2026-01-01T00:00:01Z" }]),
      assistant("m2", [{ path: "/out/data.csv", bytes: 9, modified_at: "2026-01-01T00:00:02Z" }]),
    ]);
    const listing = [
      { path: "/out/chart.svg", bytes: 100, modified_at: "2026-01-01T00:05:00Z" },
      { path: "/out/data.csv", bytes: 9, modified_at: "2026-01-01T00:00:02Z" },
      { path: "/out/new.png", bytes: 4, modified_at: "2026-01-01T00:05:01Z" },
    ];
    expect(freshFiles(listing, shown).map((f) => f.path)).toEqual([
      "/out/chart.svg",
      "/out/new.png",
    ]);
  });

  it("falls back to size when the server does not say when a file was written", () => {
    const shown = shownFileVersions([assistant("m1", [{ path: "/out/chart.svg", bytes: 100 }])]);
    expect(freshFiles([{ path: "/out/chart.svg", bytes: 100 }], shown)).toEqual([]);
    expect(freshFiles([{ path: "/out/chart.svg", bytes: 120 }], shown)).toHaveLength(1);
  });

  it("takes a rewritten file off the earlier messages that showed it", () => {
    const before = [
      assistant("m1", [{ path: "/out/chart.svg", bytes: 100 }]),
      assistant("m2", [
        { path: "/out/data.csv", bytes: 9 },
        { path: "/out/notes.md", bytes: 3 },
      ]),
    ];
    const after = withoutFiles(before, [
      { path: "/out/chart.svg", bytes: 120 },
      { path: "/out/data.csv", bytes: 10 },
    ]);
    expect(after.map((m) => m.files)).toEqual([undefined, [{ path: "/out/notes.md", bytes: 3 }]]);
    expect(withoutFiles(before, [])).toBe(before);
  });

  it("offers the zip once a message or the live turn has shown a file", () => {
    expect(threadHasFiles([assistant("m1", [])])).toBe(false);
    expect(threadHasFiles([assistant("m1", [{ path: "/out/a", bytes: 1 }])])).toBe(true);
    const stream = {
      messageId: "a1",
      content: "",
      reasoning: null,
      tool: null,
      attached: true,
      files: [{ path: "/out/a", bytes: 1 }],
    };
    expect(threadHasFiles([], stream)).toBe(true);
  });
});
