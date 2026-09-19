import {
  createUraiChatWidget,
  type ComponentRenderers,
  type ConfigOverrides,
  type ThreadChangeReason,
  type WidgetBehavior,
  type WidgetController,
  type WidgetEventListener,
  type WidgetEventName,
  type WidgetLayout,
  type WidgetTheme,
  type WidgetVars,
} from "@uraiai/chat-widget-core";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

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

export interface UraiChatWidgetProps {
  widgetToken: string;
  userId: string;
  /** Chat-service origin. Defaults to the hosted Urai deployment. */
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
   * Open this thread instead of the visitor's last one — an id saved from
   * `onThreadChange`. Applies live: changing it opens the new thread in
   * place. Pair with `readOnly` for a past-conversation viewer.
   */
  threadId?: string | null;
  /**
   * Transcript only: no composer, switcher or welcome, and nothing is
   * written. Best with `mode="inline"`. Changing it remounts the widget.
   */
  readOnly?: boolean;
  theme?: Partial<WidgetTheme>;
  layout?: Partial<WidgetLayout>;
  behavior?: Partial<WidgetBehavior>;
  /**
   * Renderers for rich components, by name — a uraiJS tool asks for one with
   * `sendCommand(thread_id, { command: "displayComponent", component, props })`.
   * Read when the widget is created. See `ComponentRenderer` in
   * `@uraiai/chat-widget-core`.
   */
  displayComponents?: ComponentRenderers;
  /**
   * "floating" (default) appends a launcher to document.body;
   * "inline" renders the chat panel inside this component's div.
   * Changing mode remounts the widget.
   */
  mode?: "floating" | "inline";
  /** Class/style for the inline container div (inline mode only). */
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  onOpened?: () => void;
  onClosed?: () => void;
  onUserMessage?: (content: string) => void;
  onAssistantReply?: (content: string) => void;
  /**
   * A uraiJS tool sent a command via `meta.urai.sendCommand`. The payload
   * is the developer's JSON, verbatim — treat as untrusted input.
   */
  onCommand?: (command: unknown) => void;
  onError?: (error: string) => void;
  /**
   * The conversation moved to another thread, or to none. Save `threadId`
   * when `reason` is `"created"` to list the visitor's conversations in
   * your own app.
   */
  onThreadChange?: (
    threadId: string | null,
    info: { previousThreadId: string | null; reason: ThreadChangeReason },
  ) => void;
}

function overridesOf(props: UraiChatWidgetProps): ConfigOverrides {
  return { theme: props.theme, layout: props.layout, behavior: props.behavior };
}

export const UraiChatWidget = forwardRef<WidgetController, UraiChatWidgetProps>(
  function UraiChatWidget(props, ref) {
    const {
      widgetToken,
      baseUrl,
      userId,
      vars,
      collections,
      threadId,
      readOnly = false,
      mode = "floating",
    } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<WidgetController | null>(null);
    // Latest props, read at controller-creation and event-dispatch time so
    // re-renders neither remount the widget nor resubscribe listeners.
    const propsRef = useRef(props);
    propsRef.current = props;

    const lastOverridesRef = useRef("");
    const lastUserIdRef = useRef("");
    const lastVarsRef = useRef("");
    const lastCollectionsRef = useRef("");
    const lastThreadIdRef = useRef<string | null>(null);

    useEffect(() => {
      const p = propsRef.current;
      const container =
        mode === "inline" ? (containerRef.current ?? undefined) : undefined;
      if (mode === "inline" && !container) return;

      const controller = createUraiChatWidget({
        widgetToken,
        baseUrl,
        userId: p.userId,
        vars: p.vars,
        collections: p.collections,
        threadId: p.threadId,
        readOnly,
        theme: p.theme,
        layout: p.layout,
        behavior: p.behavior,
        displayComponents: p.displayComponents,
        container,
      });
      controllerRef.current = controller;
      lastOverridesRef.current = JSON.stringify(overridesOf(p));
      lastUserIdRef.current = p.userId;
      lastVarsRef.current = JSON.stringify(p.vars ?? null);
      lastCollectionsRef.current = JSON.stringify(p.collections ?? null);
      lastThreadIdRef.current = p.threadId ?? null;

      const c = () => propsRef.current;
      const subscriptions = [
        controller.on("ready", () => c().onReady?.()),
        controller.on("opened", () => c().onOpened?.()),
        controller.on("closed", () => c().onClosed?.()),
        controller.on("user-message", (e) => {
          if (e.type === "user-message") c().onUserMessage?.(e.content);
        }),
        controller.on("assistant-reply", (e) => {
          if (e.type === "assistant-reply") c().onAssistantReply?.(e.content);
        }),
        controller.on("command", (e) => {
          if (e.type === "command") c().onCommand?.(e.command);
        }),
        controller.on("error", (e) => {
          if (e.type === "error") c().onError?.(e.error);
        }),
        controller.on("thread-change", (e) => {
          if (e.type === "thread-change") {
            c().onThreadChange?.(e.threadId, {
              previousThreadId: e.previousThreadId,
              reason: e.reason,
            });
          }
        }),
      ];

      return () => {
        subscriptions.forEach((off) => off());
        controller.destroy();
        if (controllerRef.current === controller) controllerRef.current = null;
      };
    }, [widgetToken, baseUrl, mode, readOnly]);

    // theme/layout/behavior apply live via configure(); deep-compare so
    // fresh object literals on every render don't trigger a config
    // re-render (which can rebuild the panel and clear the conversation).
    const overridesJson = JSON.stringify(overridesOf(props));
    useEffect(() => {
      const controller = controllerRef.current;
      if (!controller || overridesJson === lastOverridesRef.current) return;
      lastOverridesRef.current = overridesJson;
      controller.configure(JSON.parse(overridesJson) as ConfigOverrides);
    }, [overridesJson]);

    useEffect(() => {
      const controller = controllerRef.current;
      if (!controller || userId === lastUserIdRef.current) return;
      lastUserIdRef.current = userId;
      controller.setUser({ id: userId });
    }, [userId]);

    const varsJson = JSON.stringify(vars ?? null);
    useEffect(() => {
      const controller = controllerRef.current;
      if (!controller || varsJson === lastVarsRef.current) return;
      lastVarsRef.current = varsJson;
      controller.setVars(JSON.parse(varsJson) as WidgetVars | null);
    }, [varsJson]);

    // A new threadId opens in place; the one the widget was built with it
    // opens itself at mount.
    useEffect(() => {
      const controller = controllerRef.current;
      const next = threadId ?? null;
      if (!controller || next === lastThreadIdRef.current) return;
      lastThreadIdRef.current = next;
      controller.openThread(next);
    }, [threadId]);

    // Serialized for the same reason as vars: a fresh array literal on every
    // parent render would otherwise PATCH the server on every render.
    const collectionsJson = JSON.stringify(collections ?? null);
    useEffect(() => {
      const controller = controllerRef.current;
      if (!controller || collectionsJson === lastCollectionsRef.current) return;
      lastCollectionsRef.current = collectionsJson;
      controller.setCollections(JSON.parse(collectionsJson) as string[] | null);
    }, [collectionsJson]);

    // Stable facade so the ref works regardless of when (or how often)
    // the underlying controller is recreated.
    useImperativeHandle(
      ref,
      (): WidgetController => ({
        open: () => controllerRef.current?.open(),
        close: () => controllerRef.current?.close(),
        toggle: () => controllerRef.current?.toggle(),
        sendMessage: (content: string) =>
          controllerRef.current?.sendMessage(content),
        reset: () => controllerRef.current?.reset(),
        setUser: (args) => controllerRef.current?.setUser(args),
        setVars: (v) => controllerRef.current?.setVars(v),
        setCollections: (c) => controllerRef.current?.setCollections(c),
        startConversation: (o) => controllerRef.current?.startConversation(o),
        openThread: (id) => controllerRef.current?.openThread(id),
        getThreadId: () => controllerRef.current?.getThreadId() ?? null,
        getThreadSummary: (id) =>
          controllerRef.current?.getThreadSummary(id) ?? Promise.resolve(null),
        configure: (overrides) => controllerRef.current?.configure(overrides),
        on: (event: WidgetEventName, listener: WidgetEventListener) =>
          controllerRef.current?.on(event, listener) ?? (() => {}),
        get ready() {
          return controllerRef.current?.ready ?? Promise.resolve();
        },
        destroy: () => controllerRef.current?.destroy(),
      }),
      [],
    );

    if (mode === "inline") {
      return (
        <div ref={containerRef} className={props.className} style={props.style} />
      );
    }
    return null;
  },
);
