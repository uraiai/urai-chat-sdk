import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  ref,
  shallowRef,
  toRaw,
  watch,
  type Component,
  type FunctionalComponent,
  type PropType,
} from "vue";
import {
  createChatClient,
  cx,
  DEFAULT_LABELS,
  resolveLabels,
  type ChatClient,
  type ChatClientOptions,
  type ChatState,
  type NewConversationArg,
  type ThreadSummary,
  type UraiChatClassNames,
  type UraiChatLabelsInput,
  type WidgetVars,
} from "@uraiai/chat-widget-core/headless";
import { ensureStyles, themeToStyle } from "@uraiai/chat-widget-core/theme";
import type {
  ConfigOverrides,
  ResolvedConfig,
  ThreadChangeReason,
  WidgetEvent,
  WidgetEventListener,
  WidgetEventName,
} from "@uraiai/chat-widget-core";
import {
  provideChatStore,
  providePresentation,
  type PresentationContextValue,
} from "./context";
import { defaultComponents } from "./components/defaults";
import {
  SLOT_NAMES,
  type UraiChatComponents,
  type UraiChatDisplayComponents,
} from "./components/registry";
import { defaultIcons, type UraiChatIcons } from "./icons";

/**
 * Imperative access for host code outside the tree, through a template ref —
 * the same surface the React view exposes through its ref. Inside the tree,
 * prefer the composables (`useChatActions()`).
 *
 * Stable across client recreation, so a stored ref keeps working.
 */
export interface UraiChatHandle {
  sendMessage(content: string): void;
  /**
   * Buffer context for the next thread and start fresh. Pass
   * `{vars, collections}`; a bare vars object still works.
   */
  startConversation(opts?: NewConversationArg): void;
  newConversation(opts?: NewConversationArg): void;
  setUser(args: { id: string; vars?: WidgetVars | null }): void;
  setVars(vars: WidgetVars | null): void;
  /**
   * Scope this conversation's knowledge search to these collection ids, on
   * top of the assistant's own — a floor this can add to but never narrow.
   */
  setCollections(collections: string[] | null): void;
  selectThread(threadId: string): void;
  /** Show a thread the host saved; see the `threadId` prop. `null` clears. */
  openThread(threadId: string | null): void;
  /** The conversation on screen, or `null` before the first message creates one. */
  getThreadId(): string | null;
  /** A saved thread's title and timestamps; `null` if it is not this visitor's. */
  getThreadSummary(threadId: string): Promise<ThreadSummary | null>;
  configure(overrides: ConfigOverrides): void;
  on(event: WidgetEventName, listener: WidgetEventListener): () => void;
  getState(): ChatState | null;
  readonly ready: Promise<void>;
}

/** A handle that forwards to whatever client `get` returns at call time. */
export function createChatHandle(get: () => ChatClient | null): UraiChatHandle {
  return {
    sendMessage: (content) => void get()?.store.actions.send(content),
    startConversation: (opts) => get()?.store.actions.newConversation(opts),
    newConversation: (opts) => get()?.store.actions.newConversation(opts),
    setUser: ({ id, vars }) => get()?.store.actions.setUser(id, vars),
    setVars: (vars) => get()?.store.actions.setVars(vars),
    setCollections: (collections) => get()?.store.actions.setCollections(collections),
    selectThread: (id) => void get()?.store.actions.selectThread(id),
    openThread: (id) => void get()?.store.actions.openThread(id),
    getThreadId: () => get()?.store.getState().threadId ?? null,
    getThreadSummary: (id) =>
      get()?.store.actions.fetchThreadSummary(id) ?? Promise.resolve(null),
    configure: (overrides) => get()?.configure(overrides),
    on: (event, listener) => get()?.on(event, listener) ?? (() => {}),
    getState: () => get()?.store.getState() ?? null,
    get ready() {
      return get()?.ready ?? Promise.resolve();
    },
  };
}

export type ColorSchemePreference = "light" | "dark" | "system" | "host";

/** The props of `<ChatRoot>`, shared with `<UraiChat>`. */
export const chatRootProps = {
  widgetToken: { type: String, required: true },
  userId: { type: String, required: true },
  /** Chat-service origin. Defaults to the hosted Urai deployment. */
  baseUrl: { type: String, default: undefined },
  /**
   * Context stored on the thread and handed to the assistant. Applies live
   * and is compared by value, so an inline object literal is fine.
   */
  vars: { type: Object as PropType<WidgetVars | null>, default: null },
  /**
   * Knowledge collection **ids** scoping the conversation, on top of
   * whatever the assistant already carries. Ids, never slugs.
   */
  collections: { type: Array as PropType<string[] | null>, default: null },
  /**
   * Show this thread instead of the visitor's last one — an id saved from
   * `thread-change`. Applies live. It must belong to `userId`.
   */
  threadId: { type: String as PropType<string | null>, default: null },
  /**
   * Transcript only: no composer, no switcher, no welcome, and nothing is
   * written. Changing it remounts the chat.
   */
  readOnly: { type: Boolean, default: false },

  theme: { type: Object as PropType<ConfigOverrides["theme"]>, default: undefined },
  layout: { type: Object as PropType<ConfigOverrides["layout"]>, default: undefined },
  behavior: { type: Object as PropType<ConfigOverrides["behavior"]>, default: undefined },
  /** `false` skips `GET /config`; the server config is otherwise a default layer. */
  fetchServerConfig: { type: Boolean, default: true },

  /** Slot overrides by name — see `UraiChatComponents`. */
  components: {
    type: Object as PropType<Partial<UraiChatComponents>>,
    default: undefined,
  },
  /**
   * Rich components, by name. A uraiJS tool asks for one with
   * `meta.urai.sendCommand(thread_id, { command: "displayComponent",
   * component: "OrderCard", props })`. Each receives `DisplayComponentProps`.
   */
  displayComponents: {
    type: Object as PropType<UraiChatDisplayComponents>,
    default: undefined,
  },
  classNames: { type: Object as PropType<UraiChatClassNames>, default: undefined },
  labels: { type: Object as PropType<UraiChatLabelsInput>, default: undefined },
  icons: { type: Object as PropType<Partial<UraiChatIcons>>, default: undefined },
  /** Drop every default class, for a from-scratch build. */
  unstyled: { type: Boolean, default: false },
  /**
   * How the chat picks light or dark. Defaults to `"host"` — it inherits the
   * embedding app's `color-scheme`. `theme.dark` of `true` or `"system"`
   * overrides this.
   */
  colorScheme: { type: String as PropType<ColorSchemePreference>, default: undefined },
  /** Skip the auto-injected stylesheet (you are importing it yourself). */
  disableStyleInjection: { type: Boolean, default: false },

  /** Injected in tests and by the designer preview. */
  transport: {
    type: Object as PropType<ChatClientOptions["transport"]>,
    default: undefined,
  },
} as const;

export interface ThreadChangeInfo {
  previousThreadId: string | null;
  reason: ThreadChangeReason;
}

export const chatRootEmits = {
  ready: () => true,
  "user-message": (_content: string) => true,
  "assistant-reply": (_content: string) => true,
  /**
   * A uraiJS tool sent a command via `meta.urai.sendCommand`. The payload is
   * the tool author's JSON, verbatim — treat it as untrusted.
   */
  command: (_command: unknown) => true,
  error: (_error: string) => true,
  /**
   * The conversation moved to another thread, or to none. Save `threadId`
   * when `info.reason` is `"created"`.
   */
  "thread-change": (_threadId: string | null, _info: ThreadChangeInfo) => true,
};

const NO_DISPLAY_COMPONENTS: UraiChatDisplayComponents = {};

/**
 * A map of components with each value un-proxied. A map held in `reactive`
 * or `ref` state (or passed through a reactive props object) would otherwise
 * hand Vue reactive component definitions, which it warns about and renders
 * more slowly. Keys are copied as own properties only.
 */
function rawComponents<T extends object>(map: T | undefined): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!map) return out as Partial<T>;
  const raw = toRaw(map) as Record<string, unknown>;
  for (const key of Object.keys(raw)) out[key] = toRaw(raw[key]);
  return out as Partial<T>;
}
const NO_CLASS_NAMES: UraiChatClassNames = {};
let idSeq = 0;

/**
 * The root of the modular chat: owns the client, provides the store and the
 * resolved presentation to its default slot, and renders the themed root
 * element. Compose the parts inside it, or use `<UraiChat>` for the default
 * tree.
 *
 * The chat never renders on the server. Widget auth is `(token, Origin ∈
 * allowed_origins)` and a server-side fetch carries no `Origin`, so the
 * client is created in `onMounted`; until then (and in SSR output) only the
 * sized `Fallback` renders.
 *
 * Named scoped slots matching a slot name (`#SendButton="p"`) override that
 * part, like an entry in `components` — and win over one.
 */
export const ChatRoot = defineComponent({
  name: "ChatRoot",
  inheritAttrs: false,
  props: chatRootProps,
  emits: chatRootEmits,
  setup(props, { emit, slots, attrs, expose }) {
    const idPrefix = `urai-chat-${++idSeq}`;
    const client = shallowRef<ChatClient | null>(null);
    const config = shallowRef<ResolvedConfig | null>(null);
    // Keys the subtree, so a recreated client remounts every part and each
    // reads the new store at setup.
    const generation = ref(0);
    let teardown: Array<() => void> = [];

    let lastUserId = props.userId;
    let lastThreadId: string | null = props.threadId ?? null;
    let lastVars = "";
    let lastCollections = "";
    let lastOverrides = "";

    const overridesOf = (): ConfigOverrides => ({
      theme: props.theme,
      layout: props.layout,
      behavior: props.behavior,
    });

    function destroy() {
      for (const off of teardown) off();
      teardown = [];
      client.value?.destroy();
      client.value = null;
      config.value = null;
    }

    function create() {
      destroy();
      const c = createChatClient({
        widgetToken: props.widgetToken,
        userId: props.userId,
        baseUrl: props.baseUrl,
        vars: props.vars,
        collections: props.collections,
        threadId: props.threadId,
        readOnly: props.readOnly,
        theme: props.theme,
        layout: props.layout,
        behavior: props.behavior,
        fetchServerConfig: props.fetchServerConfig,
        transport: props.transport,
      });
      lastUserId = props.userId;
      lastThreadId = props.threadId ?? null;
      lastVars = JSON.stringify(props.vars ?? null);
      lastCollections = JSON.stringify(props.collections ?? null);
      lastOverrides = JSON.stringify(overridesOf());

      teardown = [
        c.on("ready", () => emit("ready")),
        ...(["user-message", "assistant-reply", "command", "error", "thread-change"] as const).map(
          (name) =>
            c.on(name, (e: WidgetEvent) => {
              if (e.type === "user-message") emit("user-message", e.content);
              else if (e.type === "assistant-reply") emit("assistant-reply", e.content);
              else if (e.type === "command") emit("command", e.command);
              else if (e.type === "error") emit("error", e.error);
              else if (e.type === "thread-change") {
                emit("thread-change", e.threadId, {
                  previousThreadId: e.previousThreadId,
                  reason: e.reason,
                });
              }
            }),
        ),
        c.store.subscribe(() => {
          const next = c.store.getState().config;
          if (next !== config.value) config.value = next;
        }),
      ];
      config.value = c.store.getState().config;
      client.value = c;
      generation.value += 1;
    }

    onMounted(() => {
      if (!props.disableStyleInjection) ensureStyles();
      create();
    });
    onBeforeUnmount(destroy);

    watch(
      () => props.disableStyleInjection,
      (off) => {
        if (!off) ensureStyles();
      },
    );

    // Only a different *connection* warrants a new client. `userId` is not
    // here: switching visitor is a live `setUser`. `readOnly` is, because it
    // decides which session store the client gets.
    watch(
      [
        () => props.widgetToken,
        () => props.baseUrl,
        () => props.transport,
        () => props.readOnly,
      ],
      () => {
        if (client.value) create();
      },
    );

    // `userId`, `threadId`, `vars` and `collections` apply live, each diffed
    // against the value the client was built with, so creation never fires a
    // redundant call. vars/collections compare by value: a fresh literal on
    // every parent render must not thrash the server.
    watch(
      () => props.userId,
      (id) => {
        if (!client.value || id === lastUserId) return;
        lastUserId = id;
        client.value.store.actions.setUser(id);
      },
    );
    watch(
      () => props.threadId ?? null,
      (id) => {
        if (!client.value || id === lastThreadId) return;
        lastThreadId = id;
        void client.value.store.actions.openThread(id);
      },
    );
    watch(
      () => JSON.stringify(props.vars ?? null),
      (json) => {
        if (!client.value || json === lastVars) return;
        lastVars = json;
        client.value.store.actions.setVars(JSON.parse(json) as WidgetVars | null);
      },
    );
    watch(
      () => JSON.stringify(props.collections ?? null),
      (json) => {
        if (!client.value || json === lastCollections) return;
        lastCollections = json;
        client.value.store.actions.setCollections(JSON.parse(json) as string[] | null);
      },
    );
    watch(
      () => JSON.stringify(overridesOf()),
      (json) => {
        if (!client.value || json === lastOverrides) return;
        lastOverrides = json;
        client.value.configure(overridesOf());
      },
    );

    // Named scoped slots as slot overrides. One wrapper per name, created
    // once, which reads the *current* slot function at render — a fresh
    // component per parent render would remount the part every time.
    const slotWrappers = Object.fromEntries(
      SLOT_NAMES.map((name) => {
        const wrapper: FunctionalComponent = (p) =>
          slots[name]?.(p as Record<string, unknown>) ?? null;
        wrapper.displayName = `UraiChatSlot(${name})`;
        wrapper.inheritAttrs = false;
        return [name, wrapper];
      }),
    ) as Record<keyof UraiChatComponents, FunctionalComponent>;
    const slotNamesOf = () => SLOT_NAMES.filter((n) => !!slots[n]).join(",");
    const presentSlots = shallowRef(slotNamesOf());
    onBeforeUpdate(() => {
      const next = slotNamesOf();
      if (next !== presentSlots.value) presentSlots.value = next;
    });

    const components = computed<UraiChatComponents>(() => {
      const fromSlots: Record<string, Component> = {};
      for (const name of presentSlots.value.split(",")) {
        if (name) fromSlots[name] = slotWrappers[name as keyof UraiChatComponents];
      }
      return { ...defaultComponents, ...rawComponents(props.components), ...fromSlots };
    });
    const icons = computed(() => ({ ...defaultIcons, ...rawComponents(props.icons) }));
    const displayComponents = computed(() =>
      props.displayComponents
        ? (rawComponents(props.displayComponents) as UraiChatDisplayComponents)
        : NO_DISPLAY_COMPONENTS,
    );
    const labels = computed(() =>
      config.value ? resolveLabels(config.value, props.labels) : DEFAULT_LABELS,
    );
    const presentation = computed<PresentationContextValue>(() => ({
      components: components.value,
      displayComponents: displayComponents.value,
      classNames: props.classNames ?? NO_CLASS_NAMES,
      labels: labels.value,
      icons: icons.value,
      unstyled: props.unstyled,
      idPrefix,
    }));
    const theme = computed(() => (config.value ? themeToStyle(config.value.theme) : null));

    provideChatStore(() => client.value?.store ?? null);
    providePresentation(() => presentation.value);

    expose(createChatHandle(() => client.value));

    return () => {
      if (!client.value || !theme.value) {
        return h(components.value.Fallback, {
          width: props.layout?.width ?? "100%",
          height: props.layout?.height ?? "100%",
        });
      }
      // `themeToStyle` reports what the theme asked for; `light` is also the
      // packaged default, so it counts as "no preference" and the chat
      // follows the host.
      const scheme =
        props.colorScheme ??
        (theme.value.scheme === "light" ? "host" : theme.value.scheme);
      const { class: hostClass, style: hostStyle, ...rest } = attrs;
      return h(
        "div",
        {
          ...rest,
          key: generation.value,
          class: [
            cx(props.unstyled ? undefined : "urai-root", props.classNames?.root),
            hostClass,
          ],
          "data-urai-part": "root",
          "data-urai-theme": scheme,
          style: [theme.value.vars, hostStyle],
        },
        slots.default?.(),
      );
    };
  },
});

/** A handle that forwards to another handle (a child `<ChatRoot>`'s) at call time. */
export function forwardChatHandle(get: () => UraiChatHandle | null): UraiChatHandle {
  return {
    sendMessage: (content) => get()?.sendMessage(content),
    startConversation: (opts) => get()?.startConversation(opts),
    newConversation: (opts) => get()?.newConversation(opts),
    setUser: (args) => get()?.setUser(args),
    setVars: (vars) => get()?.setVars(vars),
    setCollections: (collections) => get()?.setCollections(collections),
    selectThread: (id) => get()?.selectThread(id),
    openThread: (id) => get()?.openThread(id),
    getThreadId: () => get()?.getThreadId() ?? null,
    getThreadSummary: (id) => get()?.getThreadSummary(id) ?? Promise.resolve(null),
    configure: (overrides) => get()?.configure(overrides),
    on: (event, listener) => get()?.on(event, listener) ?? (() => {}),
    getState: () => get()?.getState() ?? null,
    get ready() {
      return get()?.ready ?? Promise.resolve();
    },
  };
}
