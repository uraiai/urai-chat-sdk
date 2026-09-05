import { describe, it, expect } from "vitest";
import { createReasoning } from "../../src/headless/reasoning";

describe("createReasoning", () => {
  it("starts empty and unsealed", () => {
    const r = createReasoning();
    expect(r.snapshot()).toEqual({ text: "", sealed: false });
    expect(r.started).toBe(false);
  });

  it("accumulates chunks in order", () => {
    const r = createReasoning();
    r.append("Let me ");
    r.append("check that.");
    expect(r.snapshot().text).toBe("Let me check that.");
  });

  it("ignores chunks after sealing", () => {
    const r = createReasoning();
    r.append("thinking");
    r.seal();
    r.append(" more");
    expect(r.snapshot()).toEqual({ text: "thinking", sealed: true });
  });

  it("seals idempotently", () => {
    const r = createReasoning();
    r.append("thinking");
    r.seal();
    r.seal();
    expect(r.snapshot().sealed).toBe(true);
  });

  // Mirrors the imperative version, which bails out of seal() when it
  // never built a container — i.e. when no reasoning ever arrived.
  it("does not seal when nothing was ever appended", () => {
    const r = createReasoning();
    r.seal();
    expect(r.snapshot().sealed).toBe(false);
    r.append("late reasoning");
    expect(r.snapshot().text).toBe("late reasoning");
  });

  // An empty chunk still counts as started, because the imperative
  // version creates its container on any append at all.
  it("counts an empty chunk as started, so a later seal takes", () => {
    const r = createReasoning();
    r.append("");
    expect(r.started).toBe(true);
    r.seal();
    expect(r.snapshot()).toEqual({ text: "", sealed: true });
  });
});
