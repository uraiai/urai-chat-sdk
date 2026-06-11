import {
  createUraiChatWidget,
  type ConfigOverrides,
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
  ConfigOverrides,
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
  theme?: Partial<WidgetTheme>;
  layout?: Partial<WidgetLayout>;
  behavior?: Partial<WidgetBehavior>;
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
  onError?: (error: string) => void;
}

function overridesOf(props: UraiChatWidgetProps): ConfigOverrides {
  return { theme: props.theme, layout: props.layout, behavior: props.behavior };
}

export const UraiChatWidget = forwardRef<WidgetController, UraiChatWidgetProps>(
  function UraiChatWidget(props, ref) {
    const { widgetToken, baseUrl, userId, vars, mode = "floating" } = props;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<WidgetController | null>(null);
    // Latest props, read at controller-creation and event-dispatch time so
    // re-renders neither remount the widget nor resubscribe listeners.
    const propsRef = useRef(props);
    propsRef.current = props;

    const lastOverridesRef = useRef("");
    const lastUserIdRef = useRef("");
    const lastVarsRef = useRef("");

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
        theme: p.theme,
        layout: p.layout,
        behavior: p.behavior,
        container,
      });
      controllerRef.current = controller;
      lastOverridesRef.current = JSON.stringify(overridesOf(p));
      lastUserIdRef.current = p.userId;
      lastVarsRef.current = JSON.stringify(p.vars ?? null);

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
        controller.on("error", (e) => {
          if (e.type === "error") c().onError?.(e.error);
        }),
      ];

      return () => {
        subscriptions.forEach((off) => off());
        controller.destroy();
        if (controllerRef.current === controller) controllerRef.current = null;
      };
    }, [widgetToken, baseUrl, mode]);

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
        startConversation: (v) => controllerRef.current?.startConversation(v),
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
