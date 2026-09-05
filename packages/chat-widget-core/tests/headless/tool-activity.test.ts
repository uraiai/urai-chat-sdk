import { describe, it, expect } from "vitest";
import {
  createToolActivity,
  prettyToolName,
} from "../../src/headless/tool-activity";

describe("prettyToolName", () => {
  it("maps the known tool names", () => {
    expect(prettyToolName("web_search")).toBe("Searching the web");
    expect(prettyToolName("write")).toBe("Writing a script");
    expect(prettyToolName("execute")).toBe("Running code");
    expect(prettyToolName("run_code")).toBe("Running code");
  });

  it("falls back to snake-to-words for anything else", () => {
    expect(prettyToolName("fetch_invoice")).toBe("Using fetch invoice");
    expect(prettyToolName("look-up-order")).toBe("Using look up order");
  });

  it("falls back to a generic label when the name is empty", () => {
    expect(prettyToolName("")).toBe("Using a tool");
    expect(prettyToolName("__")).toBe("Using a tool");
  });
});

describe("createToolActivity", () => {
  it("reports nothing until a call starts", () => {
    expect(createToolActivity().snapshot()).toBeNull();
  });

  it("labels the most recent call, not the first", () => {
    const t = createToolActivity();
    t.start("a", "web_search");
    t.start("b", "run_code");
    expect(t.snapshot()).toEqual({ label: "Running code", completed: false });
  });

  it("prefers a summary over the pretty name", () => {
    const t = createToolActivity();
    t.start("a", "run_code");
    t.setSummary("a", "Checked the order status");
    expect(t.snapshot()?.label).toBe("Checked the order status");
  });

  // The behaviour that makes late summaries work: `complete` must not evict.
  it("keeps a completed entry so a late summary can still relabel it", () => {
    const t = createToolActivity();
    t.start("a", "run_code");
    t.complete("a");
    expect(t.snapshot()).toEqual({ label: "Running code", completed: true });
    t.setSummary("a", "Looked up the invoice");
    expect(t.snapshot()).toEqual({
      label: "Looked up the invoice",
      completed: true,
    });
  });

  it("only clear() evicts", () => {
    const t = createToolActivity();
    t.start("a", "run_code");
    t.complete("a");
    expect(t.snapshot()).not.toBeNull();
    t.clear();
    expect(t.snapshot()).toBeNull();
  });

  it("ignores a summary or completion for a turn already cleared", () => {
    const t = createToolActivity();
    t.start("a", "run_code");
    t.clear();
    t.setSummary("a", "too late");
    t.complete("a");
    expect(t.snapshot()).toBeNull();
  });

  it("does not reorder when the same id starts twice", () => {
    const t = createToolActivity();
    t.start("a", "web_search");
    t.start("b", "run_code");
    t.start("a", "web_search");
    // "b" is still the most recent — restarting "a" must not push it again.
    expect(t.snapshot()?.label).toBe("Running code");
  });
});
