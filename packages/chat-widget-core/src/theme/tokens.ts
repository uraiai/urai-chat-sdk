/**
 * The design-token contract for the React view.
 *
 * Two structural rules keep dark mode working, and make the bug that
 * exists today impossible to reintroduce:
 *
 *   A. JS only ever writes `--urai-seed-*` inputs. It never writes a
 *      `--urai-color-*` semantic token.
 *   B. Each semantic token is defined in exactly one declaration, in the
 *      stylesheet, carrying both modes inside `light-dark()`.
 *
 * Today `applyTheme` sets `--ucw-background` as an *inline style* while
 * the stylesheet's `[data-theme="dark"]` block tries to override the
 * same property on the same element. Inline wins across origins
 * unconditionally, so the dark block is dead code.
 */
import type { PaletteSeeds } from "./palette";

export const TOKEN_PREFIX = "--urai";

/** Seed variable name for a palette role in a given mode. */
export function seedVar(role: keyof PaletteSeeds, mode: "light" | "dark"): string {
  const kebab = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `${TOKEN_PREFIX}-seed-${kebab}-${mode}`;
}

/** Semantic token → the palette role it resolves from. */
export const SEMANTIC_TOKENS: Record<string, keyof PaletteSeeds> = {
  [`${TOKEN_PREFIX}-color-primary`]: "primary",
  [`${TOKEN_PREFIX}-color-on-primary`]: "onPrimary",
  [`${TOKEN_PREFIX}-color-accent`]: "accent",
  [`${TOKEN_PREFIX}-color-surface`]: "surface",
  [`${TOKEN_PREFIX}-color-surface-raised`]: "surfaceRaised",
  [`${TOKEN_PREFIX}-color-text`]: "text",
  [`${TOKEN_PREFIX}-color-text-muted`]: "textMuted",
  [`${TOKEN_PREFIX}-color-border`]: "border",
  [`${TOKEN_PREFIX}-color-bubble-user-bg`]: "bubbleUserBg",
  [`${TOKEN_PREFIX}-color-bubble-user-text`]: "bubbleUserText",
  [`${TOKEN_PREFIX}-color-bubble-assistant-bg`]: "bubbleAssistantBg",
  [`${TOKEN_PREFIX}-color-bubble-assistant-text`]: "bubbleAssistantText",
  [`${TOKEN_PREFIX}-color-danger`]: "danger",
  [`${TOKEN_PREFIX}-shadow-color`]: "shadowColor",
};

/**
 * Tokens derived in CSS rather than JS, so they stay correct when a
 * customer overrides a base token by hand — which a JS-only derivation
 * would silently ignore.
 *
 * `surface-sunken` mixes toward *text*, not black: that makes the
 * `<pre>` background flip direction under inversion from one
 * declaration. Over white it yields #f0f1f3 against today's #f0f0f0.
 */
export const DERIVED_TOKENS: Record<string, string> = {
  [`${TOKEN_PREFIX}-color-primary-hover`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-primary) 88%, black)`,
  [`${TOKEN_PREFIX}-color-primary-active`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-primary) 78%, black)`,
  [`${TOKEN_PREFIX}-color-primary-soft`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-primary) 12%, transparent)`,
  [`${TOKEN_PREFIX}-color-surface-sunken`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-text) 6%, var(${TOKEN_PREFIX}-color-surface))`,
  [`${TOKEN_PREFIX}-color-border-strong`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-border) 60%, var(${TOKEN_PREFIX}-color-text))`,
  [`${TOKEN_PREFIX}-color-hover-on-surface`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-text) 6%, transparent)`,
  [`${TOKEN_PREFIX}-color-hover-on-primary`]: "rgb(255 255 255 / 0.15)",
  [`${TOKEN_PREFIX}-color-danger-bg`]: `color-mix(in oklab, var(${TOKEN_PREFIX}-color-danger) 12%, transparent)`,
  [`${TOKEN_PREFIX}-color-focus-ring`]: `var(${TOKEN_PREFIX}-color-accent)`,
};

/**
 * Non-color tokens. The spacing scale reproduces every literal in the
 * existing stylesheet exactly rather than being a tidy 4px ramp —
 * pixel fidelity is the requirement — multiplied by a density knob.
 * Radii derive from `--urai-radius` so `radius: 0` actually squares off
 * the chips too; at the 12px default they land within 0.04px of today's
 * hand-picked 4/6/8/10.
 */
export const STATIC_TOKENS: Record<string, string> = {
  [`${TOKEN_PREFIX}-density`]: "1",
  [`${TOKEN_PREFIX}-space-1`]: `calc(2px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-2`]: `calc(3px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-3`]: `calc(4px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-4`]: `calc(6px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-5`]: `calc(8px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-6`]: `calc(10px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-7`]: `calc(12px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-8`]: `calc(14px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-9`]: `calc(18px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-10`]: `calc(20px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-11`]: `calc(24px * var(${TOKEN_PREFIX}-density))`,
  [`${TOKEN_PREFIX}-space-12`]: `calc(32px * var(${TOKEN_PREFIX}-density))`,

  [`${TOKEN_PREFIX}-radius`]: "12px",
  [`${TOKEN_PREFIX}-radius-xs`]: `clamp(0px, calc(var(${TOKEN_PREFIX}-radius) * 0.33), 8px)`,
  [`${TOKEN_PREFIX}-radius-sm`]: `clamp(0px, calc(var(${TOKEN_PREFIX}-radius) * 0.50), 12px)`,
  [`${TOKEN_PREFIX}-radius-md`]: `clamp(0px, calc(var(${TOKEN_PREFIX}-radius) * 0.67), 16px)`,
  [`${TOKEN_PREFIX}-radius-lg`]: `clamp(0px, calc(var(${TOKEN_PREFIX}-radius) * 0.83), 20px)`,
  [`${TOKEN_PREFIX}-radius-full`]: "9999px",

  [`${TOKEN_PREFIX}-font-family`]:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  [`${TOKEN_PREFIX}-font-family-mono`]:
    "ui-monospace, SFMono-Regular, Menlo, monospace",
  [`${TOKEN_PREFIX}-font-scale`]: "1",
  [`${TOKEN_PREFIX}-font-size-2xs`]: `calc(11px * var(${TOKEN_PREFIX}-font-scale))`,
  [`${TOKEN_PREFIX}-font-size-xs`]: `calc(12px * var(${TOKEN_PREFIX}-font-scale))`,
  [`${TOKEN_PREFIX}-font-size-sm`]: `calc(13px * var(${TOKEN_PREFIX}-font-scale))`,
  [`${TOKEN_PREFIX}-font-size-md`]: `calc(14px * var(${TOKEN_PREFIX}-font-scale))`,
  [`${TOKEN_PREFIX}-line-height-tight`]: "1.3",
  [`${TOKEN_PREFIX}-line-height-snug`]: "1.4",
  [`${TOKEN_PREFIX}-line-height-normal`]: "1.5",

  [`${TOKEN_PREFIX}-shadow-panel`]: `0 10px 30px var(${TOKEN_PREFIX}-shadow-color)`,

  [`${TOKEN_PREFIX}-duration-fast`]: "100ms",
  [`${TOKEN_PREFIX}-duration-normal`]: "150ms",
  // The whole shorthand is a token, not just the duration — that is what
  // makes reduced-motion a one-line override instead of ten.
  [`${TOKEN_PREFIX}-animation-tool-pulse`]:
    "urai-tool-pulse 1s ease-in-out infinite",
  [`${TOKEN_PREFIX}-animation-thinking-pulse`]:
    "urai-thinking-pulse 1.2s ease-in-out infinite",
  [`${TOKEN_PREFIX}-stagger-thinking`]: "0.2s",

  [`${TOKEN_PREFIX}-focus-ring-width`]: "2px",
  [`${TOKEN_PREFIX}-focus-ring-offset`]: "2px",
};
