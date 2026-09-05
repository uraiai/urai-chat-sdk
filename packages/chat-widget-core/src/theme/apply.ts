/**
 * Turning a `WidgetTheme` into the inline seed variables a view sets on
 * its root element, plus the token stylesheet those seeds resolve
 * through.
 */
import { DEFAULT_THEME, type WidgetTheme } from "../config";
import { derivePalette, type PaletteSeeds } from "./palette";
import {
  DERIVED_TOKENS,
  SEMANTIC_TOKENS,
  STATIC_TOKENS,
  TOKEN_PREFIX,
  seedVar,
} from "./tokens";

/** Names must look like ours, and values must not be able to escape a declaration. */
const SAFE_NAME = /^--urai-[a-z0-9-]+$/;
const UNSAFE_VALUE = /url\s*\(|expression\s*\(|@import|[;}<]/i;

/**
 * Server-supplied strings reach `setProperty` today with no validation
 * at all. `setProperty` will not let a `}` escape the declaration, but
 * `shadow` and `fontFamily` take free text, so this guards the values
 * and constrains custom token names to our own namespace.
 */
export function sanitizeTokens(
  tokens: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens ?? {})) {
    if (!SAFE_NAME.test(name)) continue;
    if (typeof value !== "string" || UNSAFE_VALUE.test(value)) continue;
    out[name] = value;
  }
  return out;
}

export type ColorScheme = "light" | "dark" | "system" | "host";

/** `theme.dark` is a tri-state; "host" means follow the embedding app. */
export function colorSchemeOf(theme: WidgetTheme): ColorScheme {
  if (theme.dark === true) return "dark";
  if (theme.dark === false) return "light";
  if (theme.dark === "system") return "system";
  return "host";
}

export interface ThemeStyle {
  /** Inline custom properties for the root element. Seeds only. */
  vars: Record<string, string>;
  /** Value for `data-urai-theme`, which selects the `color-scheme`. */
  scheme: ColorScheme;
  /** Contrast problems worth showing in the designer. */
  warnings: string[];
}

/**
 * The seeds for both modes, plus the non-color values the admin controls.
 * Deliberately never a `--urai-color-*` token: those live in the
 * stylesheet inside `light-dark()`, and writing them inline is exactly
 * what breaks dark mode today.
 */
export function themeToStyle(
  theme: WidgetTheme,
  extraTokens?: Record<string, string>,
): ThemeStyle {
  const { light, dark, warnings } = derivePalette(theme);
  const vars: Record<string, string> = {};

  for (const role of Object.keys(light) as Array<keyof PaletteSeeds>) {
    vars[seedVar(role, "light")] = light[role];
    vars[seedVar(role, "dark")] = dark[role];
  }

  vars[`${TOKEN_PREFIX}-font-family`] = theme.fontFamily;
  vars[`${TOKEN_PREFIX}-radius`] = theme.radius;
  if (theme.shadow) vars[`${TOKEN_PREFIX}-shadow-panel`] = theme.shadow;

  Object.assign(vars, sanitizeTokens(extraTokens));

  return { vars, scheme: colorSchemeOf(theme), warnings };
}

function block(selector: string, decls: Record<string, string>): string {
  const body = Object.entries(decls)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

/**
 * The token stylesheet: `@property` registrations, the semantic layer
 * built on `light-dark()`, the CSS-derived tokens, and the static scale.
 *
 * `@property` matters for robustness: a malformed hex from the server
 * falls back to the registered `initial-value` instead of making
 * `light-dark()` invalid-at-computed-value and poisoning the subtree.
 */
export function tokensCss(scopeSelector = ".urai-root"): string {
  const parts: string[] = [];

  // Registered as real colors with the packaged palette as the initial
  // value, so a malformed hex from the server falls back to the default
  // instead of making `light-dark()` invalid and poisoning the subtree.
  const fallback = derivePalette(DEFAULT_THEME);
  for (const seed of Object.values(SEMANTIC_TOKENS)) {
    for (const mode of ["light", "dark"] as const) {
      parts.push(
        `@property ${seedVar(seed, mode)} { syntax: "<color>"; inherits: true; initial-value: ${fallback[mode][seed]}; }`,
      );
    }
  }

  const semantic: Record<string, string> = {};
  for (const [token, role] of Object.entries(SEMANTIC_TOKENS)) {
    semantic[token] =
      `light-dark(var(${seedVar(role, "light")}), var(${seedVar(role, "dark")}))`;
  }

  parts.push(
    block(scopeSelector, {
      "color-scheme": "light dark",
      ...semantic,
      ...DERIVED_TOKENS,
      ...STATIC_TOKENS,
    }),
  );

  // `color-scheme` is a per-element property, so two widgets on one page
  // can disagree about dark mode with no JS at all — which the current
  // one-shot `matchMedia` read cannot do.
  parts.push(`${scopeSelector}[data-urai-theme="light"] { color-scheme: light; }`);
  parts.push(`${scopeSelector}[data-urai-theme="dark"] { color-scheme: dark; }`);
  parts.push(`${scopeSelector}[data-urai-theme="host"] { color-scheme: inherit; }`);

  return parts.join("\n");
}
