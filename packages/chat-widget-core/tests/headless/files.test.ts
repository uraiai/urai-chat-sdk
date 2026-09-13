import { describe, expect, it } from "vitest";
import {
  freshFiles,
  isImageFile,
  isScriptableFile,
  shownFileSizes,
  workspaceFileName,
} from "../../src/headless/files";
import type { ChatMessage } from "../../src/headless/types";

function assistant(id: string, files: { path: string; bytes: number }[]): ChatMessage {
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

  it("shows a listing's new and resized files only", () => {
    const shown = shownFileSizes([
      assistant("m1", [{ path: "/out/chart.svg", bytes: 100 }]),
      assistant("m2", [{ path: "/out/data.csv", bytes: 9 }]),
    ]);
    const listing = [
      { path: "/out/chart.svg", bytes: 120 },
      { path: "/out/data.csv", bytes: 9 },
      { path: "/out/new.png", bytes: 4 },
    ];
    expect(freshFiles(listing, shown)).toEqual([
      { path: "/out/chart.svg", bytes: 120 },
      { path: "/out/new.png", bytes: 4 },
    ]);
  });

  it("remembers the latest size a path was shown at", () => {
    const shown = shownFileSizes([
      assistant("m1", [{ path: "/out/chart.svg", bytes: 100 }]),
      assistant("m2", [{ path: "/out/chart.svg", bytes: 120 }]),
    ]);
    expect(shown.get("/out/chart.svg")).toBe(120);
  });
});
