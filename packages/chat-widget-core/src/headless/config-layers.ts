/**
 * The config layering order, in one place.
 *
 * `resolveConfig` is variadic and order-sensitive, and the order was
 * previously spelled out at each call site in `create-widget.ts` — once
 * on mount and once in `configure()`. Naming the layers keeps a future
 * caller from getting the precedence subtly wrong.
 *
 *   DEFAULT_* → server → options → mode → runtime
 *
 * Server config is a **default layer**: anything supplied in code wins
 * over it. `mode` sits above `options` because mount topology is decided
 * by the presence of a container, not by either.
 */
import { resolveConfig, type ConfigOverrides, type ResolvedConfig } from "../config";

export interface ConfigLayers {
  /** From `GET /config` — the dashboard's settings. Lowest priority. */
  server?: ConfigOverrides | null;
  /** Passed to the widget factory / component by the embedder. */
  options?: ConfigOverrides | null;
  /** Derived, not authored: floating vs inline. */
  mode?: ConfigOverrides | null;
  /** From `configure()` at runtime. Highest priority. */
  runtime?: ConfigOverrides | null;
}

export function resolveLayers(layers: ConfigLayers): ResolvedConfig {
  return resolveConfig(
    layers.server,
    layers.options,
    layers.mode,
    layers.runtime,
  );
}
