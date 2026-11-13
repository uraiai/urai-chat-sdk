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
import type { BearerAuth, ServerConfig } from "../transport";
import { Emitter, type WidgetEvent, type WidgetEventListener, type WidgetEventName } from "../events";
import type { ConfigOverrides } from "../config";
import { resolveLayers } from "./config-layers";
import { createSessionStore } from "./persistence";
import { createChatStore, type ChatStore } from "./store";
import type { ChatTransport } from "./transport-port";
import type { WidgetVars } from "./types";
import type { ClientToolsSource } from "./client-tools";

export const DEFAULT_BASE_URL = "https://chat.app.urai.dev";

export interface ChatClientOptions {
  /** Required unless `bearer` is given. */
  widgetToken?: string;
  /** Required unless `bearer` is given. */
  userId?: string;
  /**
   * Sign in as a member instead of a widget visitor: Urai's own add-ons
   * (Google Docs first) talk to `/api/client/v1` with a bearer session from
   * the connect flow. Replaces `widgetToken` and `userId`.
   */
  bearer?: BearerAuth;
  /**
   * Where the current thread id is remembered in `localStorage`. Defaults to
   * the widget token (per `userId`); with `bearer`, to the agent and thread
   * ref. Give one to keep two chats on the same page apart.
   */
  storageKey?: string;
  baseUrl?: string;
  vars?: WidgetVars | null;
  /**
   * Knowledge collection **ids** scoping the conversation, on top of whatever
   * the assistant already carries. Ids, never slugs — the widget token is
   * public, so the unguessable id is what keeps the organization's other
   * collections out of reach.
   */
  collections?: string[] | null;
  /**
   * Open this thread instead of the visitor's last one — typically an id the
   * host saved from a `thread-change` event. It must belong to `userId`: the
   * server answers another visitor's thread with a 404.
   */
  threadId?: string | null;
  /**
   * Show the transcript only. Sending, uploads and "New conversation" are
   * refused, vars and collections are never written to the thread, and the
   * visitor's saved thread in `localStorage` is left alone — so viewing an
   * old conversation cannot move the visitor's live chat.
   */
  readOnly?: boolean;
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
  /**
   * Tools your app declares and runs itself, called by the agent mid-turn.
   * Needs "Allow tools declared by the embedding page" on the widget and an
   * agent-mode assistant. See `ClientToolsOptions`.
   */
  clientTools?: ClientToolsSource;
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

/** The member id a bearer chat runs under: the server knows who it is. */
const MEMBER_USER_ID = "member";

/** The default `storageKey` for a bearer chat: per agent, per thread ref. */
function bearerStorageKey(b: BearerAuth): string {
  const r = typeof b.threadRef === "function" ? b.threadRef() : b.threadRef;
  return `client:${b.agentId}:${r?.ref ?? ""}`;
}

export function createChatClient(options: ChatClientOptions): ChatClient {
  const bearer = options.bearer;
  if (!bearer) {
    if (!options.widgetToken) throw new Error("[UraiChat] widgetToken is required");
    if (!options.userId || !options.userId.trim()) {
      throw new Error("[UraiChat] userId is required");
    }
  } else if (!bearer.agentId) {
    throw new Error("[UraiChat] bearer.agentId is required");
  }
  const userId = bearer ? (options.userId?.trim() || MEMBER_USER_ID) : options.userId!;
  const storageKey =
    options.storageKey ?? (bearer ? bearerStorageKey(bearer) : options.widgetToken!);

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const emitter = new Emitter();
  const emit = (event: WidgetEvent) => emitter.emit(event);

  const transport: ChatTransport =
    options.transport ??
    new Transport(
      bearer
        ? { baseUrl, bearer }
        : { baseUrl, widgetToken: options.widgetToken, widgetUserId: userId },
    );

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
    userId,
    vars: options.vars ?? null,
    collections: options.collections ?? null,
    threadId: options.threadId ?? null,
    readOnly: options.readOnly,
    emit,
    batch: options.batch,
    clientTools: options.clientTools ?? null,
    session: createSessionStore({
      widgetToken: storageKey,
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
