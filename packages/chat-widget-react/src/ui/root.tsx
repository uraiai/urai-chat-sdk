"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  createChatClient,
  type ChatClient,
  type ChatClientOptions,
  type WidgetVars,
} from "@uraiai/chat-widget-core/headless";
import { themeToStyle } from "@uraiai/chat-widget-core/theme";
import type {
  ConfigOverrides,
  WidgetEvent,
  WidgetEventListener,
  WidgetEventName,
} from "@uraiai/chat-widget-core";
import type { ChatState } from "@uraiai/chat-widget-core/headless";
import {
  ChatStoreProvider,
  PresentationProvider,
  useChatSelector,
  usePresentation,
  type PresentationContextValue,
} from "./context";
import { cx } from "./class-names";
import type { UraiChatClassNames } from "./class-names";
import { defaultComponents } from "./components/defaults";
import type { UraiChatComponents } from "./components/registry";
import { defaultIcons, type UraiChatIcons } from "./icons";
import { resolveLabels, type UraiChatLabelsInput } from "./labels";
import { ensureStyles } from "./styles";

/**
 * Imperative access for host code outside the tree — the same surface the
 * legacy widget exposes through its ref. Inside the tree, prefer the
 * hooks (`useChatActions()`).
 *
 * Stable across client recreation, so a stored ref keeps working.
 */
export interface UraiChatHandle {
  sendMessage(content: string): void;
  /** Buffer vars for the next thread and start fresh. */
  startConversation(vars?: WidgetVars | null): void;
  newConversation(vars?: WidgetVars | null): void;
  setUser(args: { id: string; vars?: WidgetVars | null }): void;
  setVars(vars: WidgetVars | null): void;
  selectThread(threadId: string): void;
  configure(overrides: ConfigOverrides): void;
  on(event: WidgetEventName, listener: WidgetEventListener): () => void;
  getState(): ChatState | null;
  readonly ready: Promise<void>;
}

export interface ChatRootProps {
  widgetToken: string;
  userId: string;
  baseUrl?: string;
  vars?: WidgetVars | null;

  theme?: ConfigOverrides["theme"];
  layout?: ConfigOverrides["layout"];
  behavior?: ConfigOverrides["behavior"];
  /** Server config is a default layer; anything here wins over it. */
  fetchServerConfig?: boolean;

  components?: Partial<UraiChatComponents>;
  classNames?: UraiChatClassNames;
  labels?: UraiChatLabelsInput;
  icons?: Partial<UraiChatIcons>;
  /** Drop every default class, for a from-scratch Tailwind build. */
  unstyled?: boolean;
  /**
   * How the chat picks light or dark. Defaults to `"host"` — it inherits
   * the embedding app's `color-scheme`, which is what you want for a
   * chat inside someone's product.
   *
   * An explicit choice wins: `theme.dark` of `true` or `"system"` (from
   * code or the widget designer) overrides this. `theme.dark: false` is
   * indistinguishable from the packaged default, so it does not.
   */
  colorScheme?: "light" | "dark" | "system" | "host";
  /** Skip the auto-injected stylesheet (you are importing it yourself). */
  disableStyleInjection?: boolean;

  className?: string;
  style?: CSSProperties;

  onReady?(): void;
  onUserMessage?(content: string): void;
  onAssistantReply?(content: string): void;
  onCommand?(command: unknown): void;
  onError?(error: string): void;

  /** Injected in tests and by the designer preview. */
  transport?: ChatClientOptions["transport"];

  children: ReactNode;
}

/**
 * The chat never renders on the server.
 *
 * Widget auth is `(token, Origin ∈ allowed_origins)`, and a server-side
 * fetch carries no `Origin`, so `GET /config` and every call after it
 * would fail the allowlist. `"use client"` alone is not enough — Next
 * still prerenders client components — so the tree waits for a mounted
 * flag and shows a sized fallback until then. That also means no
 * hydration-mismatch class of bug, and no `getServerSnapshot` to keep
 * consistent.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export const ChatRoot = forwardRef<UraiChatHandle, ChatRootProps>(
function ChatRoot(props, ref) {
  const mounted = useMounted();
  const idPrefix = useId();

  // Callbacks are held in a ref so a parent re-render never tears down
  // the event subscriptions.
  const handlers = useRef(props);
  handlers.current = props;

  const [client, setClient] = useState<ChatClient | null>(null);

  useEffect(() => {
    if (!mounted) return;
    const c = createChatClient({
      widgetToken: props.widgetToken,
      userId: props.userId,
      baseUrl: props.baseUrl,
      vars: props.vars,
      theme: props.theme,
      layout: props.layout,
      behavior: props.behavior,
      fetchServerConfig: props.fetchServerConfig,
      transport: props.transport,
    });
    const off = c.on("ready", () => handlers.current.onReady?.());
    const offAll = (["user-message", "assistant-reply", "command", "error"] as const).map(
      (name) =>
        c.on(name, (e: WidgetEvent) => {
          const h = handlers.current;
          if (e.type === "user-message") h.onUserMessage?.(e.content);
          else if (e.type === "assistant-reply") h.onAssistantReply?.(e.content);
          else if (e.type === "command") h.onCommand?.(e.command);
          else if (e.type === "error") h.onError?.(e.error);
        }),
    );
    setClient(c);
    return () => {
      off();
      for (const o of offAll) o();
      c.destroy();
      setClient(null);
    };
    // Only a different *connection* warrants a new client. `userId` is
    // deliberately not here: switching visitor is a live `setUser` call,
    // which clears the conversation and re-scopes the transport without
    // tearing down the widget or re-fetching config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, props.widgetToken, props.baseUrl, props.transport]);

  // `userId` and `vars` apply live. Both are diffed against the value the
  // client was built with, so the first render never fires a redundant
  // call, and `vars` is compared by value — a fresh object literal on
  // every parent render must not thrash the server.
  const lastUserId = useRef(props.userId);
  useEffect(() => {
    if (!client || props.userId === lastUserId.current) return;
    lastUserId.current = props.userId;
    client.store.actions.setUser(props.userId);
  }, [client, props.userId]);

  const varsJson = JSON.stringify(props.vars ?? null);
  const lastVars = useRef(varsJson);
  useEffect(() => {
    if (!client || varsJson === lastVars.current) return;
    lastVars.current = varsJson;
    client.store.actions.setVars(JSON.parse(varsJson) as WidgetVars | null);
  }, [client, varsJson]);

  // A stable facade, so a stored ref survives the client being recreated.
  const clientRef = useRef<ChatClient | null>(null);
  clientRef.current = client;
  useImperativeHandle(
    ref,
    (): UraiChatHandle => ({
      sendMessage: (content) => void clientRef.current?.store.actions.send(content),
      startConversation: (vars) =>
        clientRef.current?.store.actions.newConversation(vars),
      newConversation: (vars) =>
        clientRef.current?.store.actions.newConversation(vars),
      setUser: ({ id, vars }) => clientRef.current?.store.actions.setUser(id, vars),
      setVars: (vars) => clientRef.current?.store.actions.setVars(vars),
      selectThread: (id) => void clientRef.current?.store.actions.selectThread(id),
      configure: (overrides) => clientRef.current?.configure(overrides),
      on: (event, listener) => clientRef.current?.on(event, listener) ?? (() => {}),
      getState: () => clientRef.current?.store.getState() ?? null,
      get ready() {
        return clientRef.current?.ready ?? Promise.resolve();
      },
    }),
    [],
  );

  // Live config updates, compared by value so a fresh object literal on
  // every parent render does not thrash the store.
  const overridesKey = JSON.stringify({
    theme: props.theme,
    layout: props.layout,
    behavior: props.behavior,
  });
  useEffect(() => {
    if (!client) return;
    client.configure({
      theme: props.theme,
      layout: props.layout,
      behavior: props.behavior,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, overridesKey]);

  useEffect(() => {
    if (props.disableStyleInjection) return;
    ensureStyles();
  }, [props.disableStyleInjection]);

  const components = useMemo(
    () => ({ ...defaultComponents, ...props.components }),
    [props.components],
  );
  const icons = useMemo(
    () => ({ ...defaultIcons, ...props.icons }),
    [props.icons],
  );

  if (!mounted || !client) {
    const Fallback = components.Fallback;
    return (
      <Fallback
        width={props.layout?.width ?? "100%"}
        height={props.layout?.height ?? "100%"}
      />
    );
  }

  return (
    <ChatStoreProvider store={client.store}>
      <PresentationBridge
        components={components}
        classNames={props.classNames ?? {}}
        icons={icons}
        labels={props.labels}
        unstyled={!!props.unstyled}
        colorScheme={props.colorScheme}
        idPrefix={idPrefix}
        className={props.className}
        style={props.style}
      >
        {props.children}
      </PresentationBridge>
    </ChatStoreProvider>
  );
});

/**
 * Reads config out of the store so labels and theme follow the server
 * layer once it lands, then renders the themed root element.
 */
function PresentationBridge(props: {
  colorScheme?: "light" | "dark" | "system" | "host";
  components: UraiChatComponents;
  classNames: UraiChatClassNames;
  icons: UraiChatIcons;
  labels?: UraiChatLabelsInput;
  unstyled: boolean;
  idPrefix: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const config = useChatSelector((s) => s.config);
  const labels = useMemo(
    () => resolveLabels(config, props.labels),
    [config, props.labels],
  );
  const value = useMemo<PresentationContextValue>(
    () => ({
      components: props.components,
      classNames: props.classNames,
      labels,
      icons: props.icons,
      unstyled: props.unstyled,
      idPrefix: props.idPrefix,
    }),
    [props.components, props.classNames, labels, props.icons, props.unstyled, props.idPrefix],
  );

  const theme = useMemo(() => themeToStyle(config.theme), [config.theme]);
  // `themeToStyle` reports what the theme asked for; `false` is also the
  // packaged default, so treat it as "no preference" and fall back to
  // following the host.
  const scheme =
    props.colorScheme ?? (theme.scheme === "light" ? "host" : theme.scheme);

  return (
    <PresentationProvider value={value}>
      <div
        className={cx(props.unstyled ? undefined : "urai-root", props.className)}
        data-urai-part="root"
        data-urai-theme={scheme}
        style={{ ...(theme.vars as CSSProperties), ...props.style }}
      >
        {props.children}
      </div>
    </PresentationProvider>
  );
}

export { usePresentation };
