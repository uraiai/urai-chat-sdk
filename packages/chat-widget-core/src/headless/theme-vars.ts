/**
 * Theme → CSS custom properties, and dark-mode resolution.
 *
 * Extracted from `theme.ts` so the shadow-DOM widget and any future
 * light-DOM view can never disagree about what a `WidgetTheme` means.
 * DOM-free: `themeToCssVars` returns a plain map, and `resolveDarkMode`
 * takes the media-query result rather than reading it.
 */
import type { WidgetTheme } from "../config";

export const VAR_PREFIX = "--ucw";

/**
 * Full custom-property names mapped to their values, ready to hand to
 * `style.setProperty` or to spread into a React `style` object.
 */
export function themeToCssVars(theme: WidgetTheme): Record<string, string> {
  const v = (name: string) => `${VAR_PREFIX}-${name}`;
  return {
    [v("primary")]: theme.primaryColor,
    [v("primary-text")]: theme.primaryTextColor,
    [v("background")]: theme.backgroundColor,
    [v("surface")]: theme.surfaceColor,
    [v("text")]: theme.textColor,
    [v("muted")]: theme.mutedColor,
    [v("border")]: theme.borderColor,
    [v("user-bg")]: theme.userBubbleColor,
    [v("user-text")]: theme.userBubbleTextColor,
    [v("asst-bg")]: theme.assistantBubbleColor,
    [v("asst-text")]: theme.assistantBubbleTextColor,
    [v("font")]: theme.fontFamily,
    [v("radius")]: theme.radius,
    [v("shadow")]: theme.shadow,
  };
}

/**
 * `theme.dark` is a tri-state: an explicit boolean, or "system" to
 * follow the OS. `prefersDark` supplies the OS answer; when it is
 * omitted the OS is consulted, and in a non-browser context "system"
 * resolves to light.
 */
export function resolveDarkMode(
  theme: WidgetTheme,
  prefersDark?: boolean,
): "light" | "dark" {
  if (theme.dark === true) return "dark";
  if (theme.dark !== "system") return "light";
  const matches =
    prefersDark ??
    (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches) ??
    false;
  return matches ? "dark" : "light";
}
