/**
 * Turns the 11 hex colors an admin can set into a full light **and**
 * dark palette.
 *
 * The rule that keeps the existing look intact:
 *
 *   For each seed, if the admin's value equals the packaged light
 *   default, use the packaged dark default. Otherwise derive the dark
 *   value from the admin's own color.
 *
 * No special cases. An untouched widget reproduces the hand-tuned dark
 * palette exactly; a customized brand gets a coherent dark treatment
 * instead of being ignored, which is what happens today.
 */
import { DEFAULT_THEME, type WidgetTheme } from "../config";
import {
  contrastRatio,
  lightnessOf,
  readableOn,
  withLightness,
} from "./color";

/** The semantic color roles, before light/dark resolution. */
export interface PaletteSeeds {
  primary: string;
  onPrimary: string;
  /** On-surface uses of the brand: links, dots, active borders. */
  accent: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  bubbleUserBg: string;
  bubbleUserText: string;
  bubbleAssistantBg: string;
  bubbleAssistantText: string;
  danger: string;
  shadowColor: string;
}

export interface DerivedPalette {
  light: PaletteSeeds;
  dark: PaletteSeeds;
  /** Contrast problems worth surfacing in the widget designer. */
  warnings: string[];
}

/** The packaged dark palette, used wherever a seed is left at its default. */
const DARK_DEFAULTS: PaletteSeeds = {
  primary: "#7c3aed",
  onPrimary: "#ffffff",
  accent: "#a78bfa",
  surface: "#0f172a",
  surfaceRaised: "#1e293b",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  border: "#334155",
  bubbleUserBg: "#6d28d9",
  bubbleUserText: "#ffffff",
  bubbleAssistantBg: "#1e293b",
  bubbleAssistantText: "#f1f5f9",
  danger: "#f87171",
  shadowColor: "rgb(0 0 0 / 0.5)",
};

function lightSeeds(theme: WidgetTheme): PaletteSeeds {
  return {
    primary: theme.primaryColor,
    onPrimary: theme.primaryTextColor,
    // In light mode the accent and the fill are the same color. They
    // diverge only in dark, where an on-surface brand color has to lift
    // to stay readable — which is the bug that makes today's links
    // render at 1.4:1 on a dark bubble.
    accent: theme.primaryColor,
    surface: theme.backgroundColor,
    surfaceRaised: theme.surfaceColor,
    text: theme.textColor,
    textMuted: theme.mutedColor,
    border: theme.borderColor,
    bubbleUserBg: theme.userBubbleColor,
    bubbleUserText: theme.userBubbleTextColor,
    bubbleAssistantBg: theme.assistantBubbleColor,
    bubbleAssistantText: theme.assistantBubbleTextColor,
    danger: "#dc2626",
    shadowColor: "rgb(15 23 42 / 0.15)",
  };
}

/** Raise lightness to `min`, leaving an already-light color alone. */
function liftAtLeast(hex: string, min: number): string {
  const l = lightnessOf(hex);
  if (l === null || l >= min) return hex;
  return withLightness(hex, min);
}

/** Per-role dark derivation, applied only where the admin customized a seed. */
const DERIVE: Partial<Record<keyof PaletteSeeds, (v: string) => string>> = {
  // Fills keep their saturation and lift only enough to stay vivid.
  primary: (v) => liftAtLeast(v, 0.48),
  accent: (v) => withLightness(v, 0.75, { maxSaturation: 0.85 }),
  bubbleUserBg: (v) => liftAtLeast(v, 0.42),
  // Surfaces invert: a light background becomes a deep, low-chroma one.
  surface: (v) => withLightness(v, 0.11, { maxSaturation: 0.25 }),
  surfaceRaised: (v) => withLightness(v, 0.18, { maxSaturation: 0.25 }),
  bubbleAssistantBg: (v) => withLightness(v, 0.18, { maxSaturation: 0.25 }),
  // Text and borders target fixed, readable lightnesses.
  text: (v) => withLightness(v, 0.95, { maxSaturation: 0.15 }),
  bubbleAssistantText: (v) => withLightness(v, 0.95, { maxSaturation: 0.15 }),
  textMuted: (v) => withLightness(v, 0.68, { maxSaturation: 0.25 }),
  border: (v) => withLightness(v, 0.3, { maxSaturation: 0.3 }),
};

/** The opposite end of the scale, as a contrast fallback. */
function contrastFallback(hex: string): string {
  const l = lightnessOf(hex);
  if (l === null) return "#0f172a";
  return l > 0.5 ? "#0f172a" : "#ffffff";
}

function collectWarnings(light: PaletteSeeds, dark: PaletteSeeds): string[] {
  const warnings: string[] = [];
  const check = (mode: string, label: string, fg: string, bg: string) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio !== null && ratio < 4.5) {
      warnings.push(
        `${label} in ${mode} mode has a contrast ratio of ${ratio.toFixed(2)}:1 (WCAG AA needs 4.5:1)`,
      );
    }
  };
  check("light", "Body text on the background", light.text, light.surface);
  check("dark", "Body text on the background", dark.text, dark.surface);
  check("light", "Muted text on the background", light.textMuted, light.surface);
  check("light", "Header text on the brand color", light.onPrimary, light.primary);
  check("dark", "Header text on the brand color", dark.onPrimary, dark.primary);
  return warnings;
}

export function derivePalette(theme: WidgetTheme): DerivedPalette {
  const light = lightSeeds(theme);
  const defaults = lightSeeds(DEFAULT_THEME);
  const dark = { ...DARK_DEFAULTS };

  for (const key of Object.keys(light) as Array<keyof PaletteSeeds>) {
    if (light[key].toLowerCase() === defaults[key].toLowerCase()) {
      continue; // untouched — the packaged dark default already applies
    }
    const derive = DERIVE[key];
    dark[key] = derive ? derive(light[key]) : light[key];
  }

  // Foregrounds are re-checked against the fill they actually sit on, in
  // both modes. Today an admin can pair a pale brand color with white
  // text and ship an unreadable header; nothing catches it.
  for (const mode of [light, dark]) {
    mode.onPrimary = readableOn(
      mode.primary,
      mode.onPrimary,
      contrastFallback(mode.onPrimary),
    );
    mode.bubbleUserText = readableOn(
      mode.bubbleUserBg,
      mode.bubbleUserText,
      contrastFallback(mode.bubbleUserText),
    );
  }

  return { light, dark, warnings: collectWarnings(light, dark) };
}
