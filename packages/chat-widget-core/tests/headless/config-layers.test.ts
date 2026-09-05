import { describe, it, expect } from "vitest";
import { resolveLayers } from "../../src/headless/config-layers";
import { DEFAULT_LAYOUT, DEFAULT_THEME } from "../../src/config";

describe("resolveLayers", () => {
  it("falls back to the defaults when no layer is given", () => {
    const c = resolveLayers({});
    expect(c.theme.primaryColor).toBe(DEFAULT_THEME.primaryColor);
    expect(c.layout.mode).toBe(DEFAULT_LAYOUT.mode);
  });

  // Server config is a default layer: code always wins over the dashboard.
  it("lets options beat server", () => {
    const c = resolveLayers({
      server: { theme: { primaryColor: "#server" } },
      options: { theme: { primaryColor: "#options" } },
    });
    expect(c.theme.primaryColor).toBe("#options");
  });

  it("lets mode beat options, since topology is derived not authored", () => {
    const c = resolveLayers({
      options: { layout: { mode: "floating" } },
      mode: { layout: { mode: "inline" } },
    });
    expect(c.layout.mode).toBe("inline");
  });

  it("lets runtime configure() beat everything", () => {
    const c = resolveLayers({
      server: { theme: { primaryColor: "#server" } },
      options: { theme: { primaryColor: "#options" } },
      mode: { theme: { primaryColor: "#mode" } },
      runtime: { theme: { primaryColor: "#runtime" } },
    });
    expect(c.theme.primaryColor).toBe("#runtime");
  });

  it("skips null and undefined values rather than letting them win", () => {
    const c = resolveLayers({
      server: { theme: { primaryColor: "#server" } },
      options: { theme: { primaryColor: undefined } },
      runtime: null,
    });
    expect(c.theme.primaryColor).toBe("#server");
  });

  it("merges across layers per key, not per section", () => {
    const c = resolveLayers({
      server: { layout: { brandName: "Acme", width: "500px" } },
      options: { layout: { brandName: "Acme Support" } },
    });
    expect(c.layout.brandName).toBe("Acme Support");
    expect(c.layout.width).toBe("500px");
  });
});
