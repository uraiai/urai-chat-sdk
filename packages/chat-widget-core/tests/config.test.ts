import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEHAVIOR,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  resolveConfig,
} from "../src/config";

describe("resolveConfig", () => {
  it("returns defaults with no layers", () => {
    const config = resolveConfig();
    expect(config.theme).toEqual(DEFAULT_THEME);
    expect(config.layout).toEqual(DEFAULT_LAYOUT);
    expect(config.behavior).toEqual(DEFAULT_BEHAVIOR);
  });

  it("applies later layers over earlier ones", () => {
    const config = resolveConfig(
      { theme: { primaryColor: "#111111" }, layout: { brandName: "Server" } },
      { theme: { primaryColor: "#222222" } },
      { theme: { primaryColor: "#333333" } },
    );
    expect(config.theme.primaryColor).toBe("#333333");
    expect(config.layout.brandName).toBe("Server");
  });

  it("skips null and undefined values inside a layer", () => {
    const config = resolveConfig(
      { theme: { primaryColor: "#111111" } },
      // null/undefined must not clobber the lower layer
      { theme: { primaryColor: undefined, backgroundColor: null as unknown as string } },
    );
    expect(config.theme.primaryColor).toBe("#111111");
    expect(config.theme.backgroundColor).toBe(DEFAULT_THEME.backgroundColor);
  });

  it("skips entirely null/undefined layers", () => {
    const config = resolveConfig(undefined, null, {
      behavior: { welcomeMessage: "hello" },
    });
    expect(config.behavior.welcomeMessage).toBe("hello");
    expect(config.behavior.placeholder).toBe(DEFAULT_BEHAVIOR.placeholder);
  });
});
