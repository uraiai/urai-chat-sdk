import { describe, it, expect } from "vitest";
import { DEFAULT_THEME } from "../../src/config";
import {
  contrastRatio,
  derivePalette,
  lightnessOf,
  parseHex,
  sanitizeTokens,
  themeToStyle,
  toHex,
  tokensCss,
  withLightness,
} from "../../src/theme";

describe("color maths", () => {
  it("round-trips hex through rgb", () => {
    expect(toHex(parseHex("#5b21b6")!)).toBe("#5b21b6");
    expect(toHex(parseHex("#abc")!)).toBe("#aabbcc");
  });

  it("preserves alpha on 8-digit hex", () => {
    expect(toHex(parseHex("#5b21b680")!)).toBe("#5b21b680");
  });

  it("returns null for anything that is not hex", () => {
    expect(parseHex("rgb(0,0,0)")).toBeNull();
    expect(parseHex("var(--x)")).toBeNull();
    expect(parseHex("rebeccapurple")).toBeNull();
  });

  it("rewrites lightness while keeping the hue", () => {
    const lifted = withLightness("#5b21b6", 0.75);
    expect(lightnessOf(lifted)).toBeCloseTo(0.75, 2);
    // Same hue family: still dominated by blue.
    const rgb = parseHex(lifted)!;
    expect(rgb.b).toBeGreaterThan(rgb.g);
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("derivePalette", () => {
  it("reproduces the packaged dark palette for an untouched theme", () => {
    const { dark } = derivePalette(DEFAULT_THEME);
    expect(dark.surface).toBe("#0f172a");
    expect(dark.text).toBe("#f1f5f9");
    expect(dark.primary).toBe("#7c3aed");
  });

  it("keeps the light palette exactly as configured", () => {
    const { light } = derivePalette({
      ...DEFAULT_THEME,
      primaryColor: "#0ea5e9",
      backgroundColor: "#fffdf7",
    });
    expect(light.primary).toBe("#0ea5e9");
    expect(light.surface).toBe("#fffdf7");
  });

  // The bug this exists to fix: today a customized brand colour is used
  // unchanged in dark mode, so links render at ~1.4:1 on a dark bubble.
  it("derives a dark treatment for a customized brand instead of ignoring it", () => {
    const { light, dark } = derivePalette({
      ...DEFAULT_THEME,
      primaryColor: "#1e3a8a", // a deep navy
    });
    expect(dark.primary).not.toBe(light.primary);
    expect(lightnessOf(dark.primary)!).toBeGreaterThanOrEqual(0.48);
  });

  it("lifts the on-surface accent well clear of the dark background", () => {
    const { dark } = derivePalette({ ...DEFAULT_THEME, primaryColor: "#1e3a8a" });
    expect(contrastRatio(dark.accent, dark.surface)!).toBeGreaterThan(4.5);
  });

  it("inverts a customized light surface rather than keeping it light", () => {
    const { dark } = derivePalette({
      ...DEFAULT_THEME,
      backgroundColor: "#fffdf7",
    });
    expect(lightnessOf(dark.surface)!).toBeLessThan(0.2);
  });

  it("flips an unreadable foreground and reports it", () => {
    // A pale brand colour with white text: unreadable, and nothing
    // catches it today.
    const { light, warnings } = derivePalette({
      ...DEFAULT_THEME,
      primaryColor: "#fde68a",
      primaryTextColor: "#ffffff",
    });
    expect(light.onPrimary).toBe("#0f172a");
    expect(contrastRatio(light.onPrimary, light.primary)!).toBeGreaterThan(4.5);
    expect(warnings).toEqual([]);
  });

  it("warns when body text fails contrast", () => {
    const { warnings } = derivePalette({
      ...DEFAULT_THEME,
      textColor: "#cccccc",
      backgroundColor: "#ffffff",
    });
    expect(warnings.join(" ")).toContain("Body text");
  });
});

describe("themeToStyle", () => {
  it("emits seeds for both modes and never a semantic token", () => {
    const { vars } = themeToStyle(DEFAULT_THEME);
    expect(vars["--urai-seed-primary-light"]).toBe("#5b21b6");
    expect(vars["--urai-seed-primary-dark"]).toBe("#7c3aed");
    // Rule A: writing a --urai-color-* inline is what breaks dark mode.
    expect(
      Object.keys(vars).some((k) => k.startsWith("--urai-color-")),
    ).toBe(false);
  });

  it("maps the tri-state dark flag onto a scheme", () => {
    expect(themeToStyle({ ...DEFAULT_THEME, dark: true }).scheme).toBe("dark");
    expect(themeToStyle({ ...DEFAULT_THEME, dark: false }).scheme).toBe("light");
    expect(themeToStyle({ ...DEFAULT_THEME, dark: "system" }).scheme).toBe("system");
  });

  it("passes through the admin's font and radius", () => {
    const { vars } = themeToStyle({
      ...DEFAULT_THEME,
      fontFamily: "Inter, sans-serif",
      radius: "4px",
    });
    expect(vars["--urai-font-family"]).toBe("Inter, sans-serif");
    expect(vars["--urai-radius"]).toBe("4px");
  });
});

describe("sanitizeTokens", () => {
  it("keeps well-formed tokens in our namespace", () => {
    expect(sanitizeTokens({ "--urai-space-6": "12px" })).toEqual({
      "--urai-space-6": "12px",
    });
  });

  it("rejects names outside the namespace", () => {
    expect(sanitizeTokens({ "--other": "1", color: "red" })).toEqual({});
  });

  it("rejects values that could escape the declaration or load a resource", () => {
    expect(
      sanitizeTokens({
        "--urai-a": "url(http://evil/x.png)",
        "--urai-b": "red; background: url(x)",
        "--urai-c": "@import 'x'",
      }),
    ).toEqual({});
  });
});

describe("tokensCss", () => {
  const css = tokensCss();

  it("registers every seed as a color with a real initial value", () => {
    expect(css).toContain(
      '@property --urai-seed-primary-light { syntax: "<color>"; inherits: true; initial-value: #5b21b6; }',
    );
    // No malformed registration: `syntax: "*"` cannot take an initial-value.
    expect(css).not.toContain('syntax: "*"');
  });

  it("defines each semantic token exactly once, via light-dark()", () => {
    const occurrences = css.split("--urai-color-primary:").length - 1;
    expect(occurrences).toBe(1);
    expect(css).toContain(
      "--urai-color-primary: light-dark(var(--urai-seed-primary-light), var(--urai-seed-primary-dark));",
    );
  });

  it("drives the mode from color-scheme, per element", () => {
    expect(css).toContain('.urai-root[data-urai-theme="dark"] { color-scheme: dark; }');
    expect(css).toContain('.urai-root[data-urai-theme="host"] { color-scheme: inherit; }');
  });

  it("scopes to a custom selector when asked", () => {
    expect(tokensCss(".my-chat")).toContain(".my-chat[data-urai-theme=\"dark\"]");
  });
});
