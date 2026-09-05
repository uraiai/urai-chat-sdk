/**
 * The headless analogue of `create-widget.ts`: builds a transport, layers
 * config, and hands back a store — with no DOM and no mount.
 *
 * Unlike `createUraiChatWidget` there is no pre-mount call queue. The
 * store exists synchronously from construction, so a `send()` issued
 * before the config fetch settles simply awaits `ensureThread()` like
 * any other. `ready` is kept for parity and for tests that want to wait.
 */
import { Transport } from "../transport";
import type { ServerConfig } from "../transport";
import { Emitter, type WidgetEvent, type WidgetEventListener, type WidgetEventName } from "../events";
import type { ConfigOverrides } from "../config";
import { resolveLayers } from "./config-layers";
import { createSessionStore } from "./persistence";
import { createChatStore, type ChatStore } from "./store";
import type { ChatTransport } from "./transport-port";
import type { WidgetVars } from "./types";

export const DEFAULT_BASE_URL = "https://chat.app.urai.dev";

export interface ChatClientOptions {
  widgetToken: string;
  userId: string;
  baseUrl?: string;
  vars?: WidgetVars | null;
  theme?: ConfigOverrides["theme"];
  layout?: ConfigOverrides["layout"];
  behavior?: ConfigOverrides["behavior"];
  /** Skip `GET /config` entirely and use defaults plus code overrides. */
  fetchServerConfig?: boolean;
  /**
   * Pre-fetched server config. Rarely useful — the widget's origin
   * allowlist means this cannot come from a server render — but it lets
   * a host that already holds the config avoid a second round-trip.
   */
  serverConfig?: ServerConfig;
  /** Injected in tests and by the designer preview. */
  transport?: ChatTransport;
  batch?: "raf" | "sync";
}

export interface ChatClient {
  store: ChatStore;
  on(event: WidgetEventName, listener: WidgetEventListener): () => void;
  /**
   * Re-resolve config with a runtime override layer — the highest
   * precedence, above both the server and the constructor options.
   */
  configure(overrides: ConfigOverrides): void;
  /** Resolves once the server config has been applied (or skipped). */
  ready: Promise<void>;
  destroy(): void;
}

function overridesOf(o: ChatClientOptions): ConfigOverrides {
  return { theme: o.theme, layout: o.layout, behavior: o.behavior };
}

export function createChatClient(options: ChatClientOptions): ChatClient {
  if (!options.widgetToken) throw new Error("[UraiChat] widgetToken is required");
  if (!options.userId || !options.userId.trim()) {
    throw new Error("[UraiChat] userId is required");
  }

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const emitter = new Emitter();
  const emit = (event: WidgetEvent) => emitter.emit(event);

  const transport: ChatTransport =
    options.transport ??
    new Transport({
      baseUrl,
      widgetToken: options.widgetToken,
      widgetUserId: options.userId,
    });

  const optionOverrides = overridesOf(options);
  let serverOverrides: ConfigOverrides = {};
  let runtimeOverrides: ConfigOverrides = {};

  const resolve = () =>
    resolveLayers({
      server: serverOverrides,
      options: optionOverrides,
      runtime: runtimeOverrides,
    });

  const store = createChatStore({
    transport,
    config: resolve(),
    userId: options.userId,
    vars: options.vars ?? null,
    emit,
    batch: options.batch,
    session: createSessionStore({
      widgetToken: options.widgetToken,
      getUserId: () => store.getState().userId,
      isEnabled: () => store.getState().config.behavior.persistAcrossSessions,
    }),
  });

  function applyServerConfig(cfg: ServerConfig) {
    serverOverrides = {
      theme: cfg.widget.theme as ConfigOverrides["theme"],
      layout: cfg.widget.layout as ConfigOverrides["layout"],
      behavior: cfg.widget.behavior as ConfigOverrides["behavior"],
    };
    store.actions.applyConfig(resolve());
  }

  async function init(): Promise<void> {
    if (options.serverConfig) {
      applyServerConfig(options.serverConfig);
    } else if (options.fetchServerConfig !== false) {
      try {
        applyServerConfig(await transport.fetchConfig());
      } catch (e) {
        // A config failure is not fatal: the widget renders with
        // defaults rather than not at all.
        console.warn("[UraiChat] config fetch failed; using defaults", e);
        emit({
          type: "error",
          error: `config fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
    await store.actions.start();
    emit({ type: "ready" });
  }

  const ready = init().catch((e) => {
    emit({
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  });

  let destroyed = false;

  return {
    store,
    on: (event, listener) => emitter.on(event, listener),
    configure(overrides) {
      runtimeOverrides = overrides;
      store.actions.applyConfig(resolve());
    },
    ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      store.actions.stop();
      emit({ type: "destroyed" });
      emitter.clear();
    },
  };
}
