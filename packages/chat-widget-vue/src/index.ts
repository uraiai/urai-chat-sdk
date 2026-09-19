import {
  createUraiChatWidget,
  type ComponentRenderers,
  type ConfigOverrides,
  type ThreadChangeReason,
  type WidgetBehavior,
  type WidgetController,
  type WidgetLayout,
  type WidgetTheme,
  type WidgetVars,
} from "@uraiai/chat-widget-core";
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type PropType,
} from "vue";

export type {
  ComponentRenderContext,
  ComponentRenderer,
  ComponentRenderers,
  ConfigOverrides,
  ThreadChangeReason,
  ThreadSummary,
  WidgetBehavior,
  WidgetController,
  WidgetLayout,
  WidgetTheme,
  WidgetVars,
} from "@uraiai/chat-widget-core";

export const UraiChatWidget = defineComponent({
  name: "UraiChatWidget",
  props: {
    widgetToken: { type: String, required: true },
    userId: { type: String, required: true },
    /** Chat-service origin. Defaults to the hosted Urai deployment. */
    baseUrl: { type: String, default: undefined },
    vars: {
      type: Object as PropType<WidgetVars | null>,
      default: null,
    },
    /**
     * Knowledge collection **ids** scoping the conversation, on top of
     * whatever the assistant already carries. Ids, never slugs — the widget
     * token is public, so the unguessable id is what keeps the
     * organization's other collections out of reach.
     */
    collections: {
      type: Array as PropType<string[] | null>,
      default: null,
    },
    /**
     * Open this thread instead of the visitor's last one — an id saved from
     * `thread-change`. Applies live: changing it opens the new thread in
     * place. Pair with `readOnly` for a past-conversation viewer.
     */
    threadId: {
      type: String as PropType<string | null>,
      default: null,
    },
    /**
     * Transcript only: no composer, switcher or welcome, and nothing is
     * written. Best with `mode="inline"`. Changing it remounts the widget.
     */
    readOnly: { type: Boolean, default: false },
    theme: {
      type: Object as PropType<Partial<WidgetTheme>>,
      default: undefined,
    },
    layout: {
      type: Object as PropType<Partial<WidgetLayout>>,
      default: undefined,
    },
    behavior: {
      type: Object as PropType<Partial<WidgetBehavior>>,
      default: undefined,
    },
    /**
     * Renderers for rich components, by name — a uraiJS tool asks for one
     * with `sendCommand(thread_id, { command: "displayComponent", component,
     * props })`. Read when the widget is created. See `ComponentRenderer` in
     * `@uraiai/chat-widget-core`.
     */
    displayComponents: {
      type: Object as PropType<ComponentRenderers>,
      default: undefined,
    },
    /**
     * "floating" (default) appends a launcher to document.body;
     * "inline" renders the chat panel inside this component's div.
     * Changing mode remounts the widget.
     */
    mode: {
      type: String as PropType<"floating" | "inline">,
      default: "floating",
    },
  },
  emits: {
    ready: () => true,
    opened: () => true,
    closed: () => true,
    "user-message": (_content: string) => true,
    "assistant-reply": (_content: string) => true,
    /**
     * A uraiJS tool sent a command via `meta.urai.sendCommand`. The
     * payload is the developer's JSON, verbatim — treat as untrusted.
     */
    command: (_command: unknown) => true,
    error: (_error: string) => true,
    /**
     * The conversation moved to another thread, or to none. Save `threadId`
     * when `info.reason` is `"created"` to list the visitor's conversations.
     */
    "thread-change": (
      _threadId: string | null,
      _info: { previousThreadId: string | null; reason: ThreadChangeReason },
    ) => true,
  },
  setup(props, { emit, expose }) {
    const containerEl = ref<HTMLDivElement | null>(null);
    // Exposed; template refs unwrap this, so parent code reads
    // `widgetRef.value.controller`.
    const controller = shallowRef<WidgetController | null>(null);
    let subscriptions: Array<() => void> = [];
    let lastOverrides = "";
    let lastVars = "";
    let lastCollections = "";
    let lastThreadId: string | null = null;

    const overridesOf = (): ConfigOverrides => ({
      theme: props.theme,
      layout: props.layout,
      behavior: props.behavior,
    });

    function destroy() {
      subscriptions.forEach((off) => off());
      subscriptions = [];
      controller.value?.destroy();
      controller.value = null;
    }

    function create() {
      destroy();
      const container =
        props.mode === "inline" ? (containerEl.value ?? undefined) : undefined;
      if (props.mode === "inline" && !container) return;

      const c = createUraiChatWidget({
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
        displayComponents: props.displayComponents,
        container,
      });
      controller.value = c;
      lastOverrides = JSON.stringify(overridesOf());
      lastVars = JSON.stringify(props.vars ?? null);
      lastCollections = JSON.stringify(props.collections ?? null);
      lastThreadId = props.threadId ?? null;
      subscriptions = [
        c.on("ready", () => emit("ready")),
        c.on("opened", () => emit("opened")),
        c.on("closed", () => emit("closed")),
        c.on("user-message", (e) => {
          if (e.type === "user-message") emit("user-message", e.content);
        }),
        c.on("assistant-reply", (e) => {
          if (e.type === "assistant-reply") emit("assistant-reply", e.content);
        }),
        c.on("command", (e) => {
          if (e.type === "command") emit("command", e.command);
        }),
        c.on("error", (e) => {
          if (e.type === "error") emit("error", e.error);
        }),
        c.on("thread-change", (e) => {
          if (e.type === "thread-change") {
            emit("thread-change", e.threadId, {
              previousThreadId: e.previousThreadId,
              reason: e.reason,
            });
          }
        }),
      ];
    }

    onMounted(create);
    onBeforeUnmount(destroy);

    // Transport identity, mount topology and read-only are constructor-time:
    // remount.
    watch(
      () => [props.widgetToken, props.baseUrl, props.mode, props.readOnly],
      () => create(),
      { flush: "post" },
    );

    // theme/layout/behavior apply live via configure(); string-compare so
    // fresh object literals don't trigger a config re-render (which can
    // rebuild the panel and clear the conversation).
    watch(
      () => JSON.stringify(overridesOf()),
      (json) => {
        if (!controller.value || json === lastOverrides) return;
        lastOverrides = json;
        controller.value.configure(JSON.parse(json) as ConfigOverrides);
      },
    );

    // A new threadId opens in place; the widget opens its first one itself.
    watch(
      () => props.threadId ?? null,
      (id) => {
        if (!controller.value || id === lastThreadId) return;
        lastThreadId = id;
        controller.value.openThread(id);
      },
    );

    watch(
      () => props.userId,
      (id) => controller.value?.setUser({ id }),
    );

    watch(
      () => JSON.stringify(props.vars ?? null),
      (json) => {
        if (!controller.value || json === lastVars) return;
        lastVars = json;
        controller.value.setVars(JSON.parse(json) as WidgetVars | null);
      },
    );

    // Serialized for the same reason as vars: a fresh array on every render
    // would otherwise PATCH the server each time the parent re-renders.
    watch(
      () => JSON.stringify(props.collections ?? null),
      (json) => {
        if (!controller.value || json === lastCollections) return;
        lastCollections = json;
        controller.value.setCollections(JSON.parse(json) as string[] | null);
      },
    );

    expose({ controller });

    return () =>
      props.mode === "inline" ? h("div", { ref: containerEl }) : null;
  },
});
