import type { WidgetTheme } from "../config";
import { resolveDarkMode, themeToCssVars } from "../headless/theme-vars";

/**
 * The `--ucw-*` variables the shadow-DOM widget still runs on. Kept
 * alongside the new token layer rather than replaced: the imperative
 * view, Vue, Svelte and the script embed all depend on this shape.
 *
 * Writes the theme onto a host element as CSS custom properties and
 * stamps `data-theme` for the stylesheet's dark block.
 *
 * The mapping itself lives in `headless/theme-vars` so a non-DOM caller
 * can produce the same variables without an element to write them to.
 */
export function applyTheme(host: HTMLElement, theme: WidgetTheme) {
  for (const [name, value] of Object.entries(themeToCssVars(theme))) {
    host.style.setProperty(name, value);
  }
  host.dataset.theme = resolveDarkMode(theme);
}
