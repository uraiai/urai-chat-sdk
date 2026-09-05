import { describe, it, expect } from "vitest";
import { resolveDarkMode, themeToCssVars } from "../../src/headless/theme-vars";
import { DEFAULT_THEME } from "../../src/config";

describe("themeToCssVars", () => {
  it("maps every theme field to a --ucw- custom property", () => {
    const vars = themeToCssVars({
      ...DEFAULT_THEME,
      primaryColor: "#111111",
      assistantBubbleTextColor: "#222222",
      radius: "4px",
    });
    expect(vars["--ucw-primary"]).toBe("#111111");
    expect(vars["--ucw-asst-text"]).toBe("#222222");
    expect(vars["--ucw-radius"]).toBe("4px");
    // 14 properties; width/height are layout, not theme.
    expect(Object.keys(vars)).toHaveLength(14);
    expect(Object.keys(vars).every((k) => k.startsWith("--ucw-"))).toBe(true);
  });
});

describe("resolveDarkMode", () => {
  it("honours an explicit boolean", () => {
    expect(resolveDarkMode({ ...DEFAULT_THEME, dark: true })).toBe("dark");
    expect(resolveDarkMode({ ...DEFAULT_THEME, dark: false })).toBe("light");
  });

  it("ignores the OS preference when the mode is explicit", () => {
    expect(resolveDarkMode({ ...DEFAULT_THEME, dark: false }, true)).toBe("light");
    expect(resolveDarkMode({ ...DEFAULT_THEME, dark: true }, false)).toBe("dark");
  });

  it("follows the supplied OS preference under 'system'", () => {
    const theme = { ...DEFAULT_THEME, dark: "system" as const };
    expect(resolveDarkMode(theme, true)).toBe("dark");
    expect(resolveDarkMode(theme, false)).toBe("light");
  });
});
