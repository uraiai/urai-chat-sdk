import {
  createUraiChatWidget,
  type ConfigOverrides,
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
  ConfigOverrides,
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
    error: (_error: string) => true,
  },
  setup(props, { emit, expose }) {
    const containerEl = ref<HTMLDivElement | null>(null);
    // Exposed; template refs unwrap this, so parent code reads
    // `widgetRef.value.controller`.
    const controller = shallowRef<WidgetController | null>(null);
    let subscriptions: Array<() => void> = [];
    let lastOverrides = "";
    let lastVars = "";

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
        theme: props.theme,
        layout: props.layout,
        behavior: props.behavior,
        container,
      });
      controller.value = c;
      lastOverrides = JSON.stringify(overridesOf());
      lastVars = JSON.stringify(props.vars ?? null);
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
        c.on("error", (e) => {
          if (e.type === "error") emit("error", e.error);
        }),
      ];
    }

    onMounted(create);
    onBeforeUnmount(destroy);

    // Transport identity and mount topology are constructor-time: remount.
    watch(
      () => [props.widgetToken, props.baseUrl, props.mode],
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

    expose({ controller });

    return () =>
      props.mode === "inline" ? h("div", { ref: containerEl }) : null;
  },
});
