// Options-object factory replacing the script-tag entry point. Creates a
// transport, fetches the server-provided widget config, mounts a
// shadow-DOM UI, and returns a controller. Multiple instances per page
// are supported — each gets its own emitter, transport, and shadow root.

import {
  resolveConfig,
  type ConfigOverrides,
  type WidgetBehavior,
  type WidgetLayout,
  type WidgetTheme,
} from "./config";
import { Transport } from "./transport";
import {
  Emitter,
  type WidgetEvent,
  type WidgetEventListener,
  type WidgetEventName,
} from "./events";
import { mountWidget, type MountedWidget, type WidgetVars } from "./ui";

/** Used when no `baseUrl` option is given (the hosted Urai deployment). */
export const DEFAULT_BASE_URL = "https://chat.app.urai.dev";

export interface UraiChatWidgetOptions {
  /** The widget token (UUID) from the chat-service widget settings. */
  widgetToken: string;
  /**
   * Stable visitor identifier supplied by the embedding app. Opaque to
   * the server; threads are isolated per (widget, userId).
   */
  userId: string;
  /**
   * Origin of the chat-service deployment, e.g.
   * "https://chat.example.com". Defaults to the hosted Urai deployment
   * (https://chat.app.urai.dev); self-hosted setups must override it.
   */
  baseUrl?: string;
  /** Context vars for the first thread this visitor creates. */
  vars?: WidgetVars | null;
  theme?: Partial<WidgetTheme>;
  layout?: Partial<WidgetLayout>;
  behavior?: Partial<WidgetBehavior>;
  /**
   * Mount target for inline mode. When provided, the widget renders
   * inside this element (layout.mode is forced to "inline"); when
   * absent, a floating launcher is appended to document.body.
   */
  container?: HTMLElement;
  /** Set false to skip the GET /config fetch and use local options only. */
  fetchServerConfig?: boolean;
}

export interface WidgetController {
  open(): void;
  close(): void;
  toggle(): void;
  sendMessage(content: string): void;
  reset(): void;
  setUser(args: { id: string; vars?: WidgetVars | null }): void;
  setVars(vars: WidgetVars | null): void;
  startConversation(vars?: WidgetVars | null): void;
  /** Re-resolve config: server config → constructor options → these overrides. */
  configure(overrides: ConfigOverrides): void;
  on(event: WidgetEventName, listener: WidgetEventListener): () => void;
  /** Resolves once the config is fetched and the widget is mounted. */
  ready: Promise<void>;
  /** Tear down DOM, streams, and listeners. Idempotent. */
  destroy(): void;
}

interface PendingCall {
  invoke: (mounted: MountedWidget) => void;
}

export function createUraiChatWidget(
  options: UraiChatWidgetOptions,
): WidgetController {
  if (typeof document === "undefined") {
    throw new Error(
      "[UraiChat] createUraiChatWidget requires a browser environment — " +
        "call it from an effect/onMount hook, not during SSR",
    );
  }
  if (!options.widgetToken) {
    throw new Error("[UraiChat] widgetToken is required");
  }
  const userId = (options.userId || "").trim();
  if (!userId) {
    throw new Error(
      "[UraiChat] userId is required — supply a stable visitor identifier",
    );
  }
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

  const emitter = new Emitter();
  const pending: PendingCall[] = [];
  let mounted: MountedWidget | null = null;
  let host: HTMLElement | null = null;
  let destroyed = false;
  // Captured so configure() can re-resolve with full layering.
  let serverOverrides: ConfigOverrides = {};

  const optionOverrides: ConfigOverrides = {
    theme: options.theme,
    layout: options.layout,
    behavior: options.behavior,
  };
  // The mount topology is decided by the caller, not the server: a
  // provided container always means inline, its absence always floating.
  const modeOverride: ConfigOverrides = {
    layout: { mode: options.container ? "inline" : "floating" },
  };

  const transport = new Transport({
    baseUrl,
    widgetToken: options.widgetToken,
    widgetUserId: userId,
  });

  // Queue calls made before the async mount completes, replay in order
  // afterwards (same contract as the embed script's window.UraiChat).
  function call(invoke: (m: MountedWidget) => void) {
    if (destroyed) return;
    if (mounted) invoke(mounted);
    else pending.push({ invoke });
  }

  async function init(): Promise<void> {
    if (options.fetchServerConfig !== false) {
      try {
        const serverConfig = await transport.fetchConfig();
        serverOverrides = {
          theme: serverConfig.widget.theme as ConfigOverrides["theme"],
          layout: serverConfig.widget.layout as ConfigOverrides["layout"],
          behavior: serverConfig.widget.behavior as ConfigOverrides["behavior"],
        };
      } catch (e) {
        console.warn("[UraiChat] config fetch failed; using defaults", e);
        emitter.emit({
          type: "error",
          error: `config fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
    if (destroyed) return;

    const config = resolveConfig(serverOverrides, optionOverrides, modeOverride);

    host = document.createElement("div");
    host.setAttribute("data-urai-chat-widget", "");
    if (options.container) {
      options.container.appendChild(host);
    } else {
      document.body.appendChild(host);
    }
    const shadow = host.attachShadow({ mode: "closed" });

    mounted = mountWidget({
      shadow,
      config,
      transport,
      widgetToken: options.widgetToken,
      initialUserId: userId,
      initialVars: options.vars ?? null,
      hostElement: host,
      emit: (event: WidgetEvent) => emitter.emit(event),
    });

    while (pending.length > 0) {
      const next = pending.shift()!;
      next.invoke(mounted);
    }
    emitter.emit({ type: "ready" });
  }

  const ready = init();
  // Surface hard failures as an error event rather than an unhandled
  // rejection for callers that never await `ready`.
  ready.catch((e) => {
    emitter.emit({
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return {
    open: () => call((m) => m.open()),
    close: () => call((m) => m.close()),
    toggle: () => call((m) => m.toggle()),
    sendMessage: (content) => call((m) => m.sendMessage(content)),
    reset: () => call((m) => m.reset()),
    setUser: ({ id, vars }) => call((m) => m.setUser(id, vars)),
    setVars: (vars) => call((m) => m.setVars(vars)),
    startConversation: (vars) => call((m) => m.startConversation(vars)),
    configure: (overrides) =>
      call((m) =>
        m.applyConfig(
          resolveConfig(serverOverrides, optionOverrides, modeOverride, overrides),
        ),
      ),
    on: (event, listener) => emitter.on(event, listener),
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pending.length = 0;
      mounted?.destroy();
      mounted = null;
      host?.remove();
      host = null;
      emitter.emit({ type: "destroyed" });
      emitter.clear();
    },
  };
}
