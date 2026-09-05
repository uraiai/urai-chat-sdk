/**
 * Just enough color maths to derive a dark palette and check contrast.
 *
 * HSL rather than OKLCH: it is a third of the code and gets the hue and
 * saturation preserved, which is what matters for "keep the brand, flip
 * the surface". OKLCH would give perceptually even lightness steps and
 * is the natural refinement, but it is not worth 250 lines here.
 * `culori` is 30KB+ for the four functions we need.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0-1. Preserved through conversions so #RRGGBBAA survives. */
  a: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Returns null for anything that is not a hex color — `rgb()`, `var()`, a keyword. */
export function parseHex(value: string): Rgb | null {
  const v = value.trim();
  if (!HEX.test(v)) return null;
  let h = v.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  if (h.length === 8) {
    return {
      r: (n >>> 24) & 0xff,
      g: (n >>> 16) & 0xff,
      b: (n >>> 8) & 0xff,
      a: (n & 0xff) / 255,
    };
  }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
}

export function toHex({ r, g, b, a }: Rgb): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  const base = `#${c(r)}${c(g)}${c(b)}`;
  return a >= 1 ? base : `${base}${c(a * 255)}`;
}

export function rgbToHsl({ r, g, b, a }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l, a };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l, a };
}

export function hslToRgb({ h, s, l, a }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v, a };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (((h % 360) + 360) % 360) / 360;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: channel(hk + 1 / 3) * 255,
    g: channel(hk) * 255,
    b: channel(hk - 1 / 3) * 255,
    a,
  };
}

/** Rewrite a hex color's lightness (and optionally cap saturation). */
export function withLightness(
  hex: string,
  l: number,
  opts: { maxSaturation?: number } = {},
): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return toHex(
    hslToRgb({
      ...hsl,
      l: Math.max(0, Math.min(1, l)),
      s:
        opts.maxSaturation === undefined
          ? hsl.s
          : Math.min(hsl.s, opts.maxSaturation),
    }),
  );
}

/** Nudge lightness toward or away from the extremes, preserving hue. */
export function shiftLightness(hex: string, delta: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return withLightness(hex, hsl.l + delta);
}

export function lightnessOf(hex: string): number | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb).l : null;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

/** WCAG contrast ratio, 1–21. Returns null if either color is not hex. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick whichever of the two candidates reads better on `background`.
 * Used to stop an admin pairing a pale brand color with white text and
 * shipping an unreadable header — today nothing catches that.
 */
export function readableOn(
  background: string,
  preferred: string,
  fallback: string,
): string {
  const preferredRatio = contrastRatio(background, preferred);
  if (preferredRatio === null) return preferred;
  if (preferredRatio >= 4.5) return preferred;
  const fallbackRatio = contrastRatio(background, fallback) ?? 0;
  return fallbackRatio > preferredRatio ? fallback : preferred;
}
