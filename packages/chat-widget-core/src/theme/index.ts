/**
 * The design-token layer: palette derivation, token spec and the CSS the
 * React view resolves its colors through.
 */
export {
  contrastRatio,
  lightnessOf,
  parseHex,
  readableOn,
  relativeLuminance,
  shiftLightness,
  toHex,
  withLightness,
  type Hsl,
  type Rgb,
} from "./color";

export {
  derivePalette,
  type DerivedPalette,
  type PaletteSeeds,
} from "./palette";

export {
  DERIVED_TOKENS,
  SEMANTIC_TOKENS,
  STATIC_TOKENS,
  TOKEN_PREFIX,
  seedVar,
} from "./tokens";

export {
  colorSchemeOf,
  sanitizeTokens,
  themeToStyle,
  tokensCss,
  type ColorScheme,
  type ThemeStyle,
} from "./apply";

// The legacy `--ucw-*` applier, still used by the shadow-DOM widget.
export { applyTheme } from "./legacy-vars";
